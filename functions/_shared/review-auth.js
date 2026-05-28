import { error, json, safeText } from "./books.js";
import {
  normalizeReviewAccessEmail,
  normalizeReviewAccessReviewerId,
  readReviewAccessList,
  writeReviewAccessList
} from "./review-access.js";

export const REVIEW_AUTH_LOG_KEY = "_tsukuyomi/review-auth-log.json";
export const REVIEW_AUTH_SUMMARY_KEY = "_tsukuyomi/review-auth-summary.json";
export const REVIEW_SESSION_ACTIVITY_KEY = "_tsukuyomi/review-session-activity.json";
export const REVIEW_AUTH_COOKIE = "tsukuyomi_review_session";

const DEFAULT_LOG_LIMIT = 200;
const DEFAULT_SUMMARY_DAYS = 45;
const DEFAULT_PASSWORD_LENGTH = 12;
const DEFAULT_SESSION_DAYS = 14;
const DEFAULT_PASSWORD_DAYS = 30;
const DEFAULT_LOGIN_FAILURE_LIMIT = 5;
const DEFAULT_LOGIN_LOCK_MINUTES = 15;
const DEFAULT_CONCURRENT_WINDOW_MINUTES = 10;
const SESSION_ACTIVITY_RETENTION_DAYS = 7;
const PBKDF2_ITERATIONS = 120000;
const PASSWORD_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

export function reviewPasswordAuthEnabled(env) {
  return truthy(env?.TSUKUYOMI_REVIEW_PASSWORD_AUTH || env?.REVIEW_PASSWORD_AUTH);
}

export function reviewPasswordIdentityAnalyticsEnabled(env) {
  return truthy(
    env?.TSUKUYOMI_REVIEW_PASSWORD_IDENTITY_ANALYTICS ||
      env?.REVIEW_PASSWORD_IDENTITY_ANALYTICS
  );
}

export function getReviewAuthSecret(env) {
  return safeText(
    env?.TSUKUYOMI_REVIEW_AUTH_SECRET ||
      env?.REVIEW_AUTH_SECRET ||
      env?.TSUKUYOMI_ADMIN_TOKEN ||
      env?.ADMIN_TOKEN,
    ""
  );
}

export async function requireReviewPasswordAuth(request, bucket, env) {
  const decision = await getReviewAuthDecision(request, bucket, env);
  if (decision.ok) return decision;
  return {
    ...decision,
    response: decision.response || reviewAuthRequiredResponse()
  };
}

export async function getReviewAuthDecision(request, bucket, env) {
  if (!reviewPasswordAuthEnabled(env)) {
    return { ok: true, authRequired: false, email: "", status: "" };
  }

  const secret = getReviewAuthSecret(env);
  if (!secret) {
    return {
      ok: false,
      authRequired: true,
      reason: "secret-missing",
      response: error(reviewAuthSecretMissingMessage(env), 500)
    };
  }

  const token = getReviewSessionToken(request);
  if (!token) {
    return {
      ok: false,
      authRequired: true,
      reason: "session-missing",
      response: reviewAuthRequiredResponse()
    };
  }

  const session = await verifyReviewSessionToken(token, secret);
  if (!session.ok) {
    return {
      ok: false,
      authRequired: true,
      reason: session.reason || "session-invalid",
      response: reviewAuthRequiredResponse("認証の有効期限が切れています")
    };
  }

  const email = normalizeReviewAccessEmail(session.payload?.email);
  const reviewerId = normalizeReviewAccessReviewerId(session.payload?.reviewerId);
  if (!email && !reviewerId) {
    return {
      ok: false,
      authRequired: true,
      reason: "identifier-invalid",
      response: reviewAuthRequiredResponse()
    };
  }

  const list = await readReviewAccessList(bucket, { includeSecrets: true });
  const entry = findReviewAuthEntry(list.entries, { email, reviewerId });
  const deniedReason = reviewAuthDeniedReason(entry, session.payload, env);
  if (deniedReason) {
    return {
      ok: false,
      authRequired: true,
      email: entry?.email || email,
      reviewerId: entry?.reviewerId || reviewerId,
      status: entry?.status || "",
      reason: deniedReason,
      response: reviewAuthDeniedResponse(deniedReason)
    };
  }

  return {
    ok: true,
    authRequired: true,
    email: entry.email || email,
    reviewerId: entry.reviewerId || reviewerId,
    status: entry.status,
    sessionId: safeText(session.payload?.sid, ""),
    entry,
    expiresAt: secondsToIso(session.payload.exp)
  };
}

export async function createReviewSession(identity, env) {
  const source = identity && typeof identity === "object" ? identity : { email: identity };
  const normalizedEmail = normalizeReviewAccessEmail(source.email);
  const reviewerId = normalizeReviewAccessReviewerId(source.reviewerId);
  const secret = getReviewAuthSecret(env);
  if ((!normalizedEmail && !reviewerId) || !secret) return null;

  const now = Math.floor(Date.now() / 1000);
  const maxAge = reviewSessionMaxAgeSeconds(env);
  const payload = {
    v: 1,
    scope: "review-password",
    email: normalizedEmail,
    reviewerId,
    sid: createSessionId(),
    iat: now,
    exp: now + maxAge
  };

  return {
    token: await signReviewSessionPayload(payload, secret),
    expiresAt: secondsToIso(payload.exp),
    maxAge
  };
}

export async function issueReviewPassword(bucket, identifier, env) {
  const normalized = normalizeReviewIdentifier(identifier);
  if (!normalized.email && !normalized.reviewerId) return { ok: false, error: "メールアドレスまたは仮IDが必要です" };

  const secret = getReviewAuthSecret(env);
  if (!secret) {
    await recordReviewAuthEvent(bucket, {
      type: "password-issue-failed",
      result: "failed",
      email: normalized.email,
      reviewerId: normalized.reviewerId,
      reason: "secret-missing"
    });
    return { ok: false, error: reviewAuthSecretMissingMessage(env) };
  }

  const list = await readReviewAccessList(bucket, { includeSecrets: true });
  const index = list.entries.findIndex((entry) => matchesReviewIdentifier(entry, normalized));
  if (index < 0) {
    await recordReviewAuthEvent(bucket, {
      type: "password-issue-failed",
      result: "failed",
      email: normalized.email,
      reviewerId: normalized.reviewerId,
      reason: "target-not-found"
    });
    return { ok: false, error: "対象メールアドレスまたは仮IDが認証管理にありません" };
  }

  const now = new Date().toISOString();
  const passwordExpiresAt = reviewPasswordExpiresAt(env, now);
  const password = generateReviewPassword(env);
  const passwordHash = await createPasswordHash(password, secret);
  const current = list.entries[index];
  const nextEntry = {
    ...current,
    status: "applied",
    appliedAt: current.appliedAt || now,
    mutedAt: "",
    revokedAt: "",
    passwordHash,
    passwordIssuedAt: now,
    passwordExpiresAt,
    passwordRevokedAt: "",
    failedLoginCount: 0,
    lastFailedAt: "",
    loginLockedUntil: ""
  };
  const entries = list.entries.map((entry, itemIndex) => (itemIndex === index ? nextEntry : entry));
  const next = await writeReviewAccessList(bucket, entries, { includeSecrets: false });
  await recordReviewAuthEvent(bucket, {
    type: "password-issued",
    result: "ok",
    email: nextEntry.email || "",
    reviewerId: nextEntry.reviewerId || "",
    reason: "admin"
  });

  return { ok: true, password, entries: next.entries, updatedAt: next.updatedAt };
}

export async function revokeReviewPassword(bucket, identifier) {
  const normalized = normalizeReviewIdentifier(identifier);
  if (!normalized.email && !normalized.reviewerId) return { ok: false, error: "メールアドレスまたは仮IDが必要です" };

  const list = await readReviewAccessList(bucket, { includeSecrets: true });
  const index = list.entries.findIndex((entry) => matchesReviewIdentifier(entry, normalized));
  if (index < 0) {
    await recordReviewAuthEvent(bucket, {
      type: "password-revoke-failed",
      result: "failed",
      email: normalized.email,
      reviewerId: normalized.reviewerId,
      reason: "target-not-found"
    });
    return { ok: false, error: "対象メールアドレスまたは仮IDが認証管理にありません" };
  }

  const now = new Date().toISOString();
  const current = list.entries[index];
  const nextEntry = {
    ...current,
    status: "revoked",
    revokedAt: now,
    passwordHash: "",
    passwordRevokedAt: now
  };
  const entries = list.entries.map((entry, itemIndex) => (itemIndex === index ? nextEntry : entry));
  const next = await writeReviewAccessList(bucket, entries, { includeSecrets: false });
  await recordReviewAuthEvent(bucket, {
    type: "password-revoked",
    result: "ok",
    email: nextEntry.email || "",
    reviewerId: nextEntry.reviewerId || "",
    reason: "admin"
  });

  return { ok: true, entries: next.entries, updatedAt: next.updatedAt };
}

export async function verifyReviewLogin(bucket, env, identifier, password) {
  const normalized = normalizeReviewIdentifier(identifier);
  const rawPassword = String(password || "");
  if ((!normalized.email && !normalized.reviewerId) || !rawPassword) {
    return { ok: false, reason: "invalid-credentials" };
  }

  const secret = getReviewAuthSecret(env);
  if (!secret) return { ok: false, reason: "secret-missing" };

  const list = await readReviewAccessList(bucket, { includeSecrets: true });
  const entry = findReviewAuthEntry(list.entries, normalized);
  let reason = "invalid-credentials";
  let passwordOk = false;

  if (entry?.passwordHash && entry.status === "applied") {
    if (isFutureDate(entry.loginLockedUntil)) {
      reason = "locked";
    } else if (isPasswordExpired(entry, env)) {
      reason = "password-expired";
    } else {
      passwordOk = await verifyPasswordHash(rawPassword, entry.passwordHash, secret);
      if (!passwordOk) reason = "password-mismatch";
    }
  } else if (entry && entry.status !== "applied") {
    reason = entry.status || "inactive";
  } else if (entry && !entry.passwordHash) {
    reason = "password-missing";
  }

  if (!entry) {
    await recordUnknownReviewIdentifierFailure(bucket, "unknown-identifier");
    return { ok: false, reason: "invalid-credentials" };
  }

  if (!passwordOk) {
    await recordReviewLoginAttempt(
      bucket,
      { email: entry.email, reviewerId: entry.reviewerId },
      false,
      reason,
      list,
      env
    );
    return { ok: false, reason: "invalid-credentials" };
  }

  await recordReviewLoginAttempt(bucket, { email: entry.email, reviewerId: entry.reviewerId }, true, "ok", list, env);
  return { ok: true, email: entry.email || normalized.email, reviewerId: entry.reviewerId || normalized.reviewerId, entry };
}

export async function recordReviewLogout() {
  return null;
}

export async function recordReviewSessionActivity(bucket, request, reviewAuth, env, kind = "api") {
  if (
    !bucket ||
    reviewAuth?.authRequired !== true ||
    (!reviewAuth?.email && !reviewAuth?.reviewerId) ||
    !reviewAuth?.sessionId
  ) {
    return null;
  }

  try {
    const current = await readReviewSessionActivity(bucket);
    const now = new Date().toISOString();
    const nowMs = Date.parse(now);
    const windowMinutes = reviewConcurrentWindowMinutes(env);
    const windowMs = windowMinutes * 60 * 1000;
    const email = normalizeReviewAccessEmail(reviewAuth.email);
    const reviewerId = normalizeReviewAccessReviewerId(reviewAuth.reviewerId);
    const reviewerKey = reviewerId || email;
    const sessionId = safeText(reviewAuth.sessionId, "").slice(0, 80);
    const sessions = current.sessions && typeof current.sessions === "object" ? { ...current.sessions } : {};
    const reviewerSessions = sessions[reviewerKey] && typeof sessions[reviewerKey] === "object" ? { ...sessions[reviewerKey] } : {};
    const activeOthers = Object.values(reviewerSessions).filter((session) => {
      if (!session || session.sid === sessionId) return false;
      const lastSeen = Date.parse(session.lastSeenAt || "");
      return Number.isFinite(lastSeen) && lastSeen >= nowMs - windowMs;
    });
    const existing = reviewerSessions[sessionId] && typeof reviewerSessions[sessionId] === "object"
      ? reviewerSessions[sessionId]
      : {};
    const lastConflict = Date.parse(existing.lastConflictAt || "");
    const shouldLogConflict =
      activeOthers.length > 0 &&
      (!Number.isFinite(lastConflict) || lastConflict < nowMs - windowMs);

    reviewerSessions[sessionId] = {
      sid: sessionId,
      firstSeenAt: existing.firstSeenAt || now,
      lastSeenAt: now,
      email,
      reviewerId,
      lastKind: safeText(kind, "api").slice(0, 40),
      userAgentHash: await requestUserAgentHash(request, env),
      country: safeText(request?.cf?.country, "").slice(0, 8),
      events: Math.min(9999, (Number(existing.events) || 0) + 1),
      lastConflictAt: shouldLogConflict ? now : safeText(existing.lastConflictAt, "")
    };
    sessions[reviewerKey] = pruneSessions(reviewerSessions, nowMs);

    const next = {
      sessions: pruneSessionActivity(sessions, nowMs),
      updatedAt: now
    };
    await bucket.put(REVIEW_SESSION_ACTIVITY_KEY, JSON.stringify(next, null, 2), {
      httpMetadata: { contentType: "application/json; charset=utf-8" }
    });

    if (shouldLogConflict) {
      await recordReviewAuthEvent(bucket, {
        type: "concurrent-session",
        result: "warn",
        email,
        reviewerId,
        reason: `${activeOthers.length + 1} sessions within ${windowMinutes}m`
      });
    }
    return next;
  } catch (err) {
    return null;
  }
}

export async function readReviewSessionActivity(bucket) {
  if (!bucket) return { sessions: {}, updatedAt: "" };
  try {
    const object = await bucket.get(REVIEW_SESSION_ACTIVITY_KEY);
    if (!object) return { sessions: {}, updatedAt: "" };
    const parsed = JSON.parse(await object.text());
    return {
      sessions: parsed?.sessions && typeof parsed.sessions === "object" ? parsed.sessions : {},
      updatedAt: safeText(parsed?.updatedAt, "")
    };
  } catch (err) {
    return { sessions: {}, updatedAt: "" };
  }
}

export async function readReviewAuthLog(bucket) {
  if (!bucket) return { events: [], updatedAt: "" };
  try {
    const object = await bucket.get(REVIEW_AUTH_LOG_KEY);
    if (!object) return { events: [], updatedAt: "" };
    const parsed = JSON.parse(await object.text());
    return {
      events: sanitizeReviewAuthEvents(parsed.events),
      updatedAt: safeText(parsed.updatedAt, "")
    };
  } catch (err) {
    return { events: [], updatedAt: "" };
  }
}

export async function readReviewAuthSummary(bucket) {
  if (!bucket) return emptyReviewAuthSummary();
  try {
    const object = await bucket.get(REVIEW_AUTH_SUMMARY_KEY);
    if (!object) return emptyReviewAuthSummary();
    return sanitizeReviewAuthSummary(JSON.parse(await object.text()));
  } catch (err) {
    return emptyReviewAuthSummary();
  }
}

export async function recordReviewAuthEvent(bucket, event) {
  if (!bucket) return null;
  try {
    const current = await readReviewAuthLog(bucket);
    const now = new Date().toISOString();
    const next = {
      events: sanitizeReviewAuthEvents([
        {
          createdAt: now,
          type: event?.type || "",
          result: event?.result || "",
          email: normalizeReviewAccessEmail(event?.email),
          reviewerId: normalizeReviewAccessReviewerId(event?.reviewerId),
          reason: safeText(event?.reason, "").slice(0, 80)
        },
        ...current.events
      ]).slice(0, DEFAULT_LOG_LIMIT),
      updatedAt: now
    };
    await bucket.put(REVIEW_AUTH_LOG_KEY, JSON.stringify(next, null, 2), {
      httpMetadata: { contentType: "application/json; charset=utf-8" }
    });
    return next;
  } catch (err) {
    return null;
  }
}

export function sessionCookieHeader(token, request, maxAge) {
  const attrs = [
    `${REVIEW_AUTH_COOKIE}=${encodeURIComponent(token || "")}`,
    "Path=/",
    `Max-Age=${Math.max(0, Number(maxAge) || 0)}`,
    "HttpOnly",
    "SameSite=Lax"
  ];
  if (isHttpsRequest(request)) attrs.push("Secure");
  return attrs.join("; ");
}

export function clearSessionCookieHeader(request) {
  return sessionCookieHeader("", request, 0);
}

export function reviewAuthRequiredResponse(message = "メールアドレスとパスワードで認証してください") {
  return json(
    { error: message, authRequired: true },
    {
      status: 401,
      headers: { "www-authenticate": "TsukuyomiReview" }
    }
  );
}

export function reviewAuthDeniedResponse(reason = "") {
  const messages = {
    muted: "現在このReaderは閲覧保留中です",
    locked: "ログイン試行が多すぎます。時間をおいて再度お試しください。",
    "password-expired": "パスワードの有効期限が切れています"
  };
  const message = messages[reason] || "このメールアドレスでは閲覧できません";
  return json({ error: message, authRequired: true, blocked: true }, { status: 403 });
}

export function reviewAuthPublicStatus(decision) {
  return {
    authRequired: decision?.authRequired === true,
    authenticated: decision?.ok === true,
    email: decision?.ok ? decision.email || "" : "",
    reviewerId: decision?.ok ? decision.reviewerId || "" : "",
    status: decision?.ok ? decision.status || "" : "",
    expiresAt: decision?.ok ? decision.expiresAt || "" : ""
  };
}

export function getReviewAuthAnalyticsEmail(reviewAuth, env) {
  if (!reviewAuth?.email || !reviewPasswordIdentityAnalyticsEnabled(env)) return "";
  return normalizeReviewAccessEmail(reviewAuth.email);
}

async function recordReviewLoginAttempt(bucket, identity, success, reason, currentList = null, env = {}) {
  const normalized = normalizeReviewIdentifier(identity);
  if (!normalized.email && !normalized.reviewerId) return;

  const now = new Date().toISOString();
  const list = currentList || await readReviewAccessList(bucket, { includeSecrets: true });
  let matchedEntry = null;
  let lockStarted = false;
  const entries = list.entries.map((entry) => {
    if (!matchesReviewIdentifier(entry, normalized)) return entry;
    matchedEntry = entry;
    if (success) {
      return {
        ...entry,
        lastLoginAt: now,
        lastAuthAt: now,
        failedLoginCount: 0,
        lastFailedAt: "",
        loginLockedUntil: ""
      };
    }

    const alreadyLocked = isFutureDate(entry.loginLockedUntil);
    const failedLoginCount = reason === "locked"
      ? Number(entry.failedLoginCount) || 0
      : Math.min(9999, (Number(entry.failedLoginCount) || 0) + 1);
    lockStarted = !alreadyLocked && failedLoginCount >= reviewLoginFailureLimit(env);
    return {
      ...entry,
      lastFailedAt: now,
      failedLoginCount,
      loginLockedUntil: lockStarted
        ? minutesFromNowIso(reviewLoginLockMinutes(env))
        : safeText(entry.loginLockedUntil, "")
    };
  });

  if (!matchedEntry) {
    await recordUnknownReviewIdentifierFailure(bucket, "unknown-identifier");
    return;
  }

  await writeReviewAccessList(bucket, entries, { includeSecrets: true }).catch(() => null);
  if (success) return;

  const detailType = reviewLoginFailureEventType(reason);
  if (detailType) {
    await recordReviewAuthEvent(bucket, {
      type: detailType,
      result: "warn",
      email: matchedEntry.email || normalized.email,
      reviewerId: matchedEntry.reviewerId || normalized.reviewerId,
      reason
    });
  }

  if (lockStarted) {
    await recordReviewAuthEvent(bucket, {
      type: "account-locked",
      result: "warn",
      email: matchedEntry.email || normalized.email,
      reviewerId: matchedEntry.reviewerId || normalized.reviewerId,
      reason: `${reviewLoginFailureLimit(env)} failures`
    });
  }
}

function reviewLoginFailureEventType(reason) {
  if (reason === "password-mismatch") return "valid-id-password-mismatch";
  if (reason === "password-expired") return "password-expired";
  if (reason === "locked") return "";
  if (reason === "password-missing" || reason === "inactive" || reason === "pending" || reason === "muted" || reason === "revoked") {
    return "valid-id-login-denied";
  }
  return "";
}

function reviewAuthSecretMissingMessage(env) {
  const adminAuthMode = String(env?.TSUKUYOMI_ADMIN_AUTH_MODE || env?.ADMIN_AUTH_MODE || "").trim().toLowerCase();
  if (adminAuthMode === "email_otp") {
    return "限定レビューPW発行には TSUKUYOMI_REVIEW_AUTH_SECRET が必要です。管理者メールOTP用の TSUKUYOMI_ADMIN_AUTH_SECRET とは別に設定してください。";
  }
  return "TSUKUYOMI_REVIEW_AUTH_SECRET または TSUKUYOMI_ADMIN_TOKEN が未設定です";
}

async function recordUnknownReviewIdentifierFailure(bucket, reason = "unknown-identifier") {
  if (!bucket) return null;
  try {
    const current = await readReviewAuthSummary(bucket);
    const now = new Date().toISOString();
    const day = now.slice(0, 10);
    const failures = current.unknownIdentifierFailures || {};
    const byDay = pruneDailyCounts({
      ...(failures.byDay || {}),
      [day]: Math.min(999999, (Number(failures.byDay?.[day]) || 0) + 1)
    });
    const next = sanitizeReviewAuthSummary({
      ...current,
      updatedAt: now,
      unknownIdentifierFailures: {
        total: Math.min(999999999, (Number(failures.total) || 0) + 1),
        lastAt: now,
        lastReason: safeText(reason, "unknown-identifier").slice(0, 40),
        byDay
      }
    });
    await bucket.put(REVIEW_AUTH_SUMMARY_KEY, JSON.stringify(next, null, 2), {
      httpMetadata: { contentType: "application/json; charset=utf-8" }
    });
    return next;
  } catch (err) {
    return null;
  }
}

function reviewAuthDeniedReason(entry, payload, env = {}) {
  if (!entry) return "not-allowed";
  if (entry.status === "muted") return "muted";
  if (entry.status === "revoked") return "revoked";
  if (entry.status !== "applied") return "pending";
  if (!entry.passwordHash) return "password-missing";
  if (isFutureDate(entry.loginLockedUntil)) return "locked";
  if (isPasswordExpired(entry, env)) return "password-expired";

  const issuedAt = Date.parse(entry.passwordIssuedAt || "");
  const tokenIssuedAt = Number(payload?.iat) * 1000;
  if (Number.isFinite(issuedAt) && Number.isFinite(tokenIssuedAt) && tokenIssuedAt + 1000 < issuedAt) {
    return "password-reissued";
  }
  return "";
}

function normalizeReviewIdentifier(value) {
  if (value && typeof value === "object") {
    return {
      email: normalizeReviewAccessEmail(value.email || value.identifier),
      reviewerId: normalizeReviewAccessReviewerId(value.reviewerId || value.identifier)
    };
  }

  const raw = safeText(value, "");
  const email = normalizeReviewAccessEmail(raw);
  return {
    email,
    reviewerId: email ? "" : normalizeReviewAccessReviewerId(raw)
  };
}

function findReviewAuthEntry(entries, identifier) {
  const normalized = normalizeReviewIdentifier(identifier);
  return (Array.isArray(entries) ? entries : []).find((entry) => matchesReviewIdentifier(entry, normalized));
}

function matchesReviewIdentifier(entry, identifier) {
  const normalized = normalizeReviewIdentifier(identifier);
  const entryEmail = normalizeReviewAccessEmail(entry?.email);
  const entryReviewerId = normalizeReviewAccessReviewerId(entry?.reviewerId);
  return Boolean(
    (normalized.email && entryEmail && normalized.email === entryEmail) ||
      (normalized.reviewerId && entryReviewerId && normalized.reviewerId === entryReviewerId)
  );
}

function generateReviewPassword(env) {
  const length = Math.max(8, Math.min(32, Number(env?.TSUKUYOMI_REVIEW_PASSWORD_LENGTH) || DEFAULT_PASSWORD_LENGTH));
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((byte) => PASSWORD_CHARS[byte % PASSWORD_CHARS.length])
    .join("");
}

function reviewPasswordExpiresAt(env, issuedAt) {
  const days = reviewPasswordDays(env);
  const date = new Date(issuedAt);
  if (Number.isNaN(date.getTime())) return "";
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

function reviewPasswordDays(env) {
  return Math.max(1, Math.min(365, Number(env?.TSUKUYOMI_REVIEW_PASSWORD_DAYS) || DEFAULT_PASSWORD_DAYS));
}

function reviewLoginFailureLimit(env) {
  return Math.max(3, Math.min(20, Number(env?.TSUKUYOMI_REVIEW_LOGIN_FAILURE_LIMIT) || DEFAULT_LOGIN_FAILURE_LIMIT));
}

function reviewLoginLockMinutes(env) {
  return Math.max(1, Math.min(1440, Number(env?.TSUKUYOMI_REVIEW_LOGIN_LOCK_MINUTES) || DEFAULT_LOGIN_LOCK_MINUTES));
}

function reviewConcurrentWindowMinutes(env) {
  return Math.max(1, Math.min(120, Number(env?.TSUKUYOMI_REVIEW_CONCURRENT_WINDOW_MINUTES) || DEFAULT_CONCURRENT_WINDOW_MINUTES));
}

function minutesFromNowIso(minutes) {
  return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}

function isFutureDate(value) {
  const time = Date.parse(value || "");
  return Number.isFinite(time) && time > Date.now();
}

function isPastDate(value) {
  const raw = safeText(value, "");
  if (!raw) return false;
  const time = Date.parse(raw);
  return Number.isFinite(time) && time <= Date.now();
}

function isPasswordExpired(entry, env) {
  if (isPastDate(entry?.passwordExpiresAt)) return true;
  if (entry?.passwordExpiresAt) return false;

  const issuedAt = Date.parse(entry?.passwordIssuedAt || "");
  if (!Number.isFinite(issuedAt)) return false;
  const expiresAt = new Date(issuedAt);
  expiresAt.setUTCDate(expiresAt.getUTCDate() + reviewPasswordDays(env));
  return expiresAt.getTime() <= Date.now();
}

function createSessionId() {
  if (crypto?.randomUUID) return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return base64UrlFromBytes(bytes);
}

async function requestUserAgentHash(request, env) {
  const userAgent = safeText(request?.headers?.get("user-agent"), "").slice(0, 512);
  if (!userAgent) return "";
  const secret = getReviewAuthSecret(env) || "tsukuyomi";
  return sha256Hex(`${secret}:ua:${userAgent}`);
}

function pruneSessions(sessions, nowMs) {
  const cutoff = nowMs - SESSION_ACTIVITY_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  return Object.fromEntries(
    Object.entries(sessions || {}).filter(([, session]) => {
      const lastSeen = Date.parse(session?.lastSeenAt || "");
      return Number.isFinite(lastSeen) && lastSeen >= cutoff;
    })
  );
}

function pruneSessionActivity(sessions, nowMs) {
  return Object.fromEntries(
    Object.entries(sessions || {})
      .map(([email, emailSessions]) => [email, pruneSessions(emailSessions, nowMs)])
      .filter(([, emailSessions]) => Object.keys(emailSessions).length > 0)
      .slice(0, 200)
  );
}

async function sha256Hex(value) {
  const data = new TextEncoder().encode(String(value || ""));
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function createPasswordHash(password, secret) {
  const saltBytes = new Uint8Array(16);
  crypto.getRandomValues(saltBytes);
  const salt = base64UrlFromBytes(saltBytes);
  const hash = await derivePasswordHash(password, secret, salt, PBKDF2_ITERATIONS);
  return `pbkdf2-sha256$${PBKDF2_ITERATIONS}$${salt}$${hash}`;
}

async function verifyPasswordHash(password, storedHash, secret) {
  const parts = String(storedHash || "").split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2-sha256") return false;
  const iterations = Number(parts[1]) || 0;
  const salt = parts[2] || "";
  const expected = parts[3] || "";
  if (!iterations || !salt || !expected) return false;

  const actual = await derivePasswordHash(password, secret, salt, iterations);
  return constantTimeEqual(actual, expected);
}

async function derivePasswordHash(password, secret, salt, iterations) {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(`${secret}:${password}`),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: encoder.encode(`tsukuyomi-review:${salt}`),
      iterations,
      hash: "SHA-256"
    },
    keyMaterial,
    256
  );
  return base64UrlFromBytes(new Uint8Array(bits));
}

async function signReviewSessionPayload(payload, secret) {
  const encodedPayload = base64UrlFromString(JSON.stringify(payload));
  const signature = await hmacSha256(`${encodedPayload}`, secret);
  return `${encodedPayload}.${signature}`;
}

async function verifyReviewSessionToken(token, secret) {
  const [encodedPayload, signature] = String(token || "").split(".", 2);
  if (!encodedPayload || !signature) return { ok: false, reason: "session-malformed" };

  const expected = await hmacSha256(encodedPayload, secret);
  if (!constantTimeEqual(signature, expected)) return { ok: false, reason: "signature-invalid" };

  let payload = null;
  try {
    payload = JSON.parse(stringFromBase64Url(encodedPayload));
  } catch (err) {
    return { ok: false, reason: "payload-invalid" };
  }

  const now = Math.floor(Date.now() / 1000);
  if (payload?.scope !== "review-password" || Number(payload?.exp) <= now) {
    return { ok: false, reason: "session-expired" };
  }

  return { ok: true, payload };
}

async function hmacSha256(value, secret) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return base64UrlFromBytes(new Uint8Array(signature));
}

function getReviewSessionToken(request) {
  const headerToken = safeText(request.headers.get("x-tsukuyomi-review-session"), "");
  if (headerToken) return headerToken;

  const cookie = request.headers.get("cookie") || "";
  const prefix = `${REVIEW_AUTH_COOKIE}=`;
  const part = cookie.split(/;\s*/).find((item) => item.startsWith(prefix));
  if (!part) return "";
  return decodeURIComponent(part.slice(prefix.length));
}

function reviewSessionMaxAgeSeconds(env) {
  const days = Math.max(1, Math.min(90, Number(env?.TSUKUYOMI_REVIEW_AUTH_SESSION_DAYS) || DEFAULT_SESSION_DAYS));
  return Math.round(days * 24 * 60 * 60);
}

function sanitizeReviewAuthEvents(events) {
  if (!Array.isArray(events)) return [];
  return events
    .map((event) => {
      const createdAt = normalizeDateTime(event?.createdAt);
      const type = safeText(event?.type, "").slice(0, 40);
      const result = safeText(event?.result, "").slice(0, 20);
      const email = normalizeReviewAccessEmail(event?.email);
      const reviewerId = normalizeReviewAccessReviewerId(event?.reviewerId);
      const reason = safeText(event?.reason, "").slice(0, 80);
      if (!createdAt || !type) return null;
      return { createdAt, type, result, email, reviewerId, reason };
    })
    .filter(Boolean)
    .slice(0, DEFAULT_LOG_LIMIT);
}

function emptyReviewAuthSummary() {
  return {
    updatedAt: "",
    unknownIdentifierFailures: {
      total: 0,
      lastAt: "",
      lastReason: "",
      byDay: {}
    }
  };
}

function sanitizeReviewAuthSummary(value) {
  const source = value && typeof value === "object" ? value : {};
  const failures = source.unknownIdentifierFailures && typeof source.unknownIdentifierFailures === "object"
    ? source.unknownIdentifierFailures
    : {};
  return {
    updatedAt: normalizeDateTime(source.updatedAt),
    unknownIdentifierFailures: {
      total: normalizeLargeCount(failures.total),
      lastAt: normalizeDateTime(failures.lastAt),
      lastReason: safeText(failures.lastReason, "").slice(0, 40),
      byDay: pruneDailyCounts(failures.byDay)
    }
  };
}

function pruneDailyCounts(value, limit = DEFAULT_SUMMARY_DAYS) {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(
    Object.entries(value)
      .map(([day, count]) => [safeText(day, "").slice(0, 10), normalizeLargeCount(count)])
      .filter(([day, count]) => /^\d{4}-\d{2}-\d{2}$/.test(day) && count > 0)
      .sort((a, b) => b[0].localeCompare(a[0]))
      .slice(0, limit)
  );
}

function normalizeLargeCount(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(999999999, Math.floor(number)));
}

function normalizeDateTime(value) {
  const raw = safeText(value, "");
  if (!raw) return "";
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function secondsToIso(seconds) {
  const number = Number(seconds) || 0;
  if (!number) return "";
  const date = new Date(number * 1000);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function base64UrlFromString(value) {
  return base64UrlFromBytes(new TextEncoder().encode(String(value || "")));
}

function stringFromBase64Url(value) {
  return new TextDecoder().decode(bytesFromBase64Url(value));
}

function base64UrlFromBytes(bytes) {
  let base64 = "";
  if (typeof btoa === "function") {
    let binary = "";
    bytes.forEach((byte) => {
      binary += String.fromCharCode(byte);
    });
    base64 = btoa(binary);
  } else if (typeof Buffer !== "undefined") {
    base64 = Buffer.from(bytes).toString("base64");
  }
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function bytesFromBase64Url(value) {
  const base64 = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = `${base64}${"=".repeat((4 - (base64.length % 4)) % 4)}`;
  if (typeof atob === "function") {
    const binary = atob(padded);
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  }
  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(padded, "base64"));
  }
  return new Uint8Array();
}

function constantTimeEqual(a, b) {
  const left = String(a || "");
  const right = String(b || "");
  let mismatch = left.length === right.length ? 0 : 1;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    mismatch |= left.charCodeAt(index % Math.max(1, left.length)) ^ right.charCodeAt(index % Math.max(1, right.length));
  }
  return mismatch === 0;
}

function isHttpsRequest(request) {
  try {
    return new URL(request.url).protocol === "https:";
  } catch (err) {
    return false;
  }
}

function truthy(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "on";
}

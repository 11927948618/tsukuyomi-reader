export const ADMIN_AUTH_CHALLENGES_KEY = "_tsukuyomi/admin-auth-challenges.json";
export const ADMIN_AUTH_LOG_KEY = "_tsukuyomi/admin-auth-log.json";
export const ADMIN_AUTH_COOKIE = "tsukuyomi_admin_session";

const DEFAULT_ADMIN_EMAILS = [
  "halthejuggernaut@gmail.com",
  "haltherock@yahoo.com",
  "weezartherock@gmail.com"
];
const DEFAULT_OTP_MINUTES = 10;
const DEFAULT_SESSION_HOURS = 12;
const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_LOG_LIMIT = 200;

export function adminAuthMode(env) {
  const mode = safeText(env?.TSUKUYOMI_ADMIN_AUTH_MODE || env?.ADMIN_AUTH_MODE, "token").toLowerCase();
  return mode === "email_otp" ? "email_otp" : "token";
}

export async function verifyAdminRequest(request, env) {
  if (adminAuthMode(env) !== "email_otp") return verifyAdminTokenRequest(request, env);
  return verifyAdminSessionRequest(request, env);
}

export function adminAuthPublicConfig(env) {
  return {
    mode: adminAuthMode(env),
    emailProvider: safeText(env?.TSUKUYOMI_ADMIN_EMAIL_PROVIDER || "resend", "resend").toLowerCase(),
    allowedEmailCount: getAdminAllowedEmails(env).length
  };
}

export async function adminAuthStatus(request, env) {
  const config = adminAuthPublicConfig(env);
  if (config.mode !== "email_otp") {
    return { ...config, authenticated: false, email: "", expiresAt: "" };
  }

  const decision = await verifyAdminSessionRequest(request, env);
  return {
    ...config,
    authenticated: decision.ok === true,
    email: decision.ok ? decision.email || "" : "",
    expiresAt: decision.ok ? decision.expiresAt || "" : ""
  };
}

export async function requestAdminOtp(bucket, env, email) {
  const normalizedEmail = normalizeEmail(email);
  const challengeId = createRandomId();
  const allowed = isAllowedAdminEmail(env, normalizedEmail);
  if (!normalizedEmail || !allowed) {
    return { ok: true, challengeId, sent: false };
  }

  const secret = getAdminAuthSecret(env);
  if (!secret) return { ok: false, error: "TSUKUYOMI_ADMIN_AUTH_SECRET が未設定です" };

  const now = new Date().toISOString();
  const expiresAt = minutesFromNowIso(adminOtpMinutes(env));
  const otp = createOtp();
  const salt = createRandomId();
  const challenge = {
    id: challengeId,
    email: normalizedEmail,
    hash: await otpHash(otp, secret, salt),
    salt,
    createdAt: now,
    expiresAt,
    attempts: 0,
    usedAt: ""
  };

  const current = await readAdminChallenges(bucket);
  const next = {
    challenges: [
      challenge,
      ...pruneChallenges(current.challenges).filter((item) => item.email !== normalizedEmail)
    ].slice(0, 100),
    updatedAt: now
  };
  await writeAdminChallenges(bucket, next);

  const sent = await sendAdminOtpEmail(env, normalizedEmail, otp);
  if (!sent.ok) {
    await writeAdminChallenges(bucket, {
      challenges: next.challenges.filter((item) => item.id !== challengeId),
      updatedAt: new Date().toISOString()
    });
    await recordAdminAuthEvent(bucket, {
      type: "otp-send-failed",
      result: "error",
      email: normalizedEmail,
      reason: sent.error || "send-failed"
    });
    return { ok: false, error: sent.error || "OTPメール送信に失敗しました" };
  }

  await recordAdminAuthEvent(bucket, {
    type: "otp-sent",
    result: "ok",
    email: normalizedEmail,
    reason: "resend"
  });
  return { ok: true, challengeId, sent: true, expiresAt };
}

export async function verifyAdminOtp(bucket, env, email, challengeId, otp) {
  const normalizedEmail = normalizeEmail(email);
  const id = safeText(challengeId, "").slice(0, 80);
  const code = normalizeOtp(otp);
  if (!normalizedEmail || !id || !code || !isAllowedAdminEmail(env, normalizedEmail)) {
    return { ok: false, reason: "invalid-otp" };
  }

  const secret = getAdminAuthSecret(env);
  if (!secret) return { ok: false, reason: "secret-missing" };

  const current = await readAdminChallenges(bucket);
  const now = new Date().toISOString();
  let matched = null;
  const challenges = current.challenges.map((challenge) => {
    if (challenge.id !== id || challenge.email !== normalizedEmail) return challenge;
    matched = challenge;
    return challenge;
  });

  if (!matched || matched.usedAt || isPastDate(matched.expiresAt) || Number(matched.attempts) >= DEFAULT_MAX_ATTEMPTS) {
    await recordAdminAuthEvent(bucket, {
      type: "otp-verify-failed",
      result: "failed",
      email: normalizedEmail,
      reason: "invalid-or-expired"
    });
    return { ok: false, reason: "invalid-otp" };
  }

  const ok = constantTimeEqual(await otpHash(code, secret, matched.salt), matched.hash);
  const nextChallenges = challenges.map((challenge) => {
    if (challenge.id !== id || challenge.email !== normalizedEmail) return challenge;
    return {
      ...challenge,
      attempts: Math.min(999, (Number(challenge.attempts) || 0) + (ok ? 0 : 1)),
      usedAt: ok ? now : ""
    };
  });
  await writeAdminChallenges(bucket, {
    challenges: pruneChallenges(nextChallenges),
    updatedAt: now
  });

  await recordAdminAuthEvent(bucket, {
    type: ok ? "otp-verified" : "otp-verify-failed",
    result: ok ? "ok" : "failed",
    email: normalizedEmail,
    reason: ok ? "admin" : "mismatch"
  });

  return ok ? { ok: true, email: normalizedEmail } : { ok: false, reason: "invalid-otp" };
}

export async function createAdminSession(email, env) {
  const normalizedEmail = normalizeEmail(email);
  const secret = getAdminAuthSecret(env);
  if (!normalizedEmail || !secret) return null;

  const now = Math.floor(Date.now() / 1000);
  const maxAge = adminSessionMaxAgeSeconds(env);
  const payload = {
    v: 1,
    scope: "admin-email-otp",
    email: normalizedEmail,
    sid: createRandomId(),
    iat: now,
    exp: now + maxAge
  };

  return {
    token: await signSessionPayload(payload, secret),
    expiresAt: secondsToIso(payload.exp),
    maxAge
  };
}

export function adminSessionCookieHeader(token, request, maxAge) {
  const attrs = [
    `${ADMIN_AUTH_COOKIE}=${encodeURIComponent(token || "")}`,
    "Path=/",
    `Max-Age=${Math.max(0, Number(maxAge) || 0)}`,
    "HttpOnly",
    "SameSite=Lax"
  ];
  if (isHttpsRequest(request)) attrs.push("Secure");
  return attrs.join("; ");
}

export function clearAdminSessionCookieHeader(request) {
  return adminSessionCookieHeader("", request, 0);
}

export async function recordAdminLogout(bucket, email) {
  const normalizedEmail = normalizeEmail(email);
  if (!bucket || !normalizedEmail) return null;
  return recordAdminAuthEvent(bucket, {
    type: "logout",
    result: "ok",
    email: normalizedEmail,
    reason: "admin"
  });
}

async function verifyAdminSessionRequest(request, env) {
  const secret = getAdminAuthSecret(env);
  if (!secret) {
    return { ok: false, status: 500, error: "TSUKUYOMI_ADMIN_AUTH_SECRET が未設定です" };
  }

  const token = getAdminSessionToken(request);
  if (!token) return { ok: false, status: 401, error: "管理者メール認証が必要です" };

  const session = await verifySessionToken(token, secret);
  if (!session.ok) return { ok: false, status: 401, error: "管理セッションの有効期限が切れています" };

  const email = normalizeEmail(session.payload?.email);
  if (!email || !isAllowedAdminEmail(env, email)) {
    return { ok: false, status: 401, error: "管理者メール認証が必要です" };
  }

  return {
    ok: true,
    email,
    expiresAt: secondsToIso(session.payload.exp)
  };
}

function verifyAdminTokenRequest(request, env) {
  const expected = safeText(env?.TSUKUYOMI_ADMIN_TOKEN || env?.ADMIN_TOKEN, "");
  if (!expected) {
    return { ok: false, status: 500, error: "TSUKUYOMI_ADMIN_TOKEN が未設定です" };
  }

  const auth = request.headers.get("authorization") || "";
  const bearer = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  const headerToken = request.headers.get("x-admin-token") || "";
  const actual = bearer || headerToken;

  if (!actual || actual !== expected) {
    return { ok: false, status: 401, error: "管理トークンが違います" };
  }
  return { ok: true };
}

async function sendAdminOtpEmail(env, email, otp) {
  const provider = safeText(env?.TSUKUYOMI_ADMIN_EMAIL_PROVIDER || "resend", "resend").toLowerCase();
  if (provider !== "resend") return { ok: false, error: `未対応のメール送信方式です: ${provider}` };

  const apiKey = safeText(env?.RESEND_API_KEY, "");
  const from = safeText(env?.TSUKUYOMI_ADMIN_EMAIL_FROM, "");
  if (!apiKey) return { ok: false, error: "RESEND_API_KEY が未設定です" };
  if (!from) return { ok: false, error: "TSUKUYOMI_ADMIN_EMAIL_FROM が未設定です" };

  const subject = "TsukuyomiReader 管理ログインコード";
  const text = [
    "TsukuyomiReader 管理画面のログインコードです。",
    "",
    `コード: ${otp}`,
    "",
    `${adminOtpMinutes(env)}分以内に入力してください。`,
    "このメールに心当たりがない場合は破棄してください。"
  ].join("\n");

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        from,
        to: [email],
        subject,
        text
      })
    });
    if (!res.ok) {
      const payload = await res.json().catch(() => null);
      return { ok: false, error: payload?.message || `Resend HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err?.message || "Resend送信に失敗しました" };
  }
}

async function readAdminChallenges(bucket) {
  if (!bucket) return { challenges: [], updatedAt: "" };
  try {
    const object = await bucket.get(ADMIN_AUTH_CHALLENGES_KEY);
    if (!object) return { challenges: [], updatedAt: "" };
    const parsed = JSON.parse(await object.text());
    return {
      challenges: sanitizeChallenges(parsed?.challenges),
      updatedAt: safeText(parsed?.updatedAt, "")
    };
  } catch (err) {
    return { challenges: [], updatedAt: "" };
  }
}

async function writeAdminChallenges(bucket, value) {
  if (!bucket) return null;
  const next = {
    challenges: sanitizeChallenges(value?.challenges),
    updatedAt: safeText(value?.updatedAt, new Date().toISOString())
  };
  await bucket.put(ADMIN_AUTH_CHALLENGES_KEY, JSON.stringify(next, null, 2), {
    httpMetadata: { contentType: "application/json; charset=utf-8" }
  });
  return next;
}

async function recordAdminAuthEvent(bucket, event) {
  if (!bucket) return null;
  try {
    const current = await readAdminAuthLog(bucket);
    const now = new Date().toISOString();
    const next = {
      events: sanitizeLogEvents([
        {
          createdAt: now,
          type: event?.type || "",
          result: event?.result || "",
          email: normalizeEmail(event?.email),
          reason: safeText(event?.reason, "").slice(0, 80)
        },
        ...current.events
      ]).slice(0, DEFAULT_LOG_LIMIT),
      updatedAt: now
    };
    await bucket.put(ADMIN_AUTH_LOG_KEY, JSON.stringify(next, null, 2), {
      httpMetadata: { contentType: "application/json; charset=utf-8" }
    });
    return next;
  } catch (err) {
    return null;
  }
}

async function readAdminAuthLog(bucket) {
  if (!bucket) return { events: [], updatedAt: "" };
  try {
    const object = await bucket.get(ADMIN_AUTH_LOG_KEY);
    if (!object) return { events: [], updatedAt: "" };
    const parsed = JSON.parse(await object.text());
    return {
      events: sanitizeLogEvents(parsed?.events),
      updatedAt: safeText(parsed?.updatedAt, "")
    };
  } catch (err) {
    return { events: [], updatedAt: "" };
  }
}

function getAdminAllowedEmails(env) {
  const configured = safeText(env?.TSUKUYOMI_ADMIN_EMAILS || env?.ADMIN_EMAILS, "");
  const source = configured ? configured.split(",") : DEFAULT_ADMIN_EMAILS;
  return [...new Set(source.map(normalizeEmail).filter(Boolean))].slice(0, 20);
}

function isAllowedAdminEmail(env, email) {
  const normalizedEmail = normalizeEmail(email);
  return Boolean(normalizedEmail && getAdminAllowedEmails(env).includes(normalizedEmail));
}

function getAdminAuthSecret(env) {
  return safeText(env?.TSUKUYOMI_ADMIN_AUTH_SECRET || env?.ADMIN_AUTH_SECRET, "");
}

function adminOtpMinutes(env) {
  return Math.max(1, Math.min(60, Number(env?.TSUKUYOMI_ADMIN_OTP_MINUTES) || DEFAULT_OTP_MINUTES));
}

function adminSessionMaxAgeSeconds(env) {
  const hours = Math.max(1, Math.min(168, Number(env?.TSUKUYOMI_ADMIN_SESSION_HOURS) || DEFAULT_SESSION_HOURS));
  return Math.round(hours * 60 * 60);
}

function sanitizeChallenges(challenges) {
  if (!Array.isArray(challenges)) return [];
  return challenges
    .map((challenge) => {
      const id = safeText(challenge?.id, "").slice(0, 80);
      const email = normalizeEmail(challenge?.email);
      const hash = safeText(challenge?.hash, "").slice(0, 128);
      const salt = safeText(challenge?.salt, "").slice(0, 80);
      const createdAt = normalizeDateTime(challenge?.createdAt);
      const expiresAt = normalizeDateTime(challenge?.expiresAt);
      const attempts = normalizeCount(challenge?.attempts);
      const usedAt = normalizeDateTime(challenge?.usedAt);
      if (!id || !email || !hash || !salt || !createdAt || !expiresAt) return null;
      return { id, email, hash, salt, createdAt, expiresAt, attempts, usedAt };
    })
    .filter(Boolean)
    .slice(0, 100);
}

function pruneChallenges(challenges) {
  const now = Date.now();
  return sanitizeChallenges(challenges).filter((challenge) => {
    if (challenge.usedAt) return false;
    const expiresAt = Date.parse(challenge.expiresAt || "");
    return Number.isFinite(expiresAt) && expiresAt > now;
  });
}

function sanitizeLogEvents(events) {
  if (!Array.isArray(events)) return [];
  return events
    .map((event) => {
      const createdAt = normalizeDateTime(event?.createdAt);
      const type = safeText(event?.type, "").slice(0, 40);
      const result = safeText(event?.result, "").slice(0, 20);
      const email = normalizeEmail(event?.email);
      const reason = safeText(event?.reason, "").slice(0, 80);
      if (!createdAt || !type) return null;
      return { createdAt, type, result, email, reason };
    })
    .filter(Boolean)
    .slice(0, DEFAULT_LOG_LIMIT);
}

function createOtp() {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  const value = new DataView(bytes.buffer).getUint32(0);
  return String(value % 1000000).padStart(6, "0");
}

function createRandomId() {
  if (crypto?.randomUUID) return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return base64UrlFromBytes(bytes);
}

async function otpHash(otp, secret, salt) {
  return sha256Hex(`${secret}:admin-otp:${salt}:${otp}`);
}

async function signSessionPayload(payload, secret) {
  const encodedPayload = base64UrlFromString(JSON.stringify(payload));
  const signature = await hmacSha256(encodedPayload, secret);
  return `${encodedPayload}.${signature}`;
}

async function verifySessionToken(token, secret) {
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
  if (payload?.scope !== "admin-email-otp" || Number(payload?.exp) <= now) {
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

async function sha256Hex(value) {
  const data = new TextEncoder().encode(String(value || ""));
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function getAdminSessionToken(request) {
  const headerToken = safeText(request.headers.get("x-tsukuyomi-admin-session"), "");
  if (headerToken) return headerToken;

  const cookie = request.headers.get("cookie") || "";
  const prefix = `${ADMIN_AUTH_COOKIE}=`;
  const part = cookie.split(/;\s*/).find((item) => item.startsWith(prefix));
  if (!part) return "";
  return decodeURIComponent(part.slice(prefix.length));
}

function normalizeEmail(value) {
  const email = safeText(value, "").toLowerCase().slice(0, 160);
  if (!email) return "";
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

function normalizeOtp(value) {
  const otp = String(value || "").replace(/\D+/g, "").slice(0, 6);
  return otp.length === 6 ? otp : "";
}

function normalizeDateTime(value) {
  const raw = safeText(value, "");
  if (!raw) return "";
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function normalizeCount(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(999, Math.floor(number)));
}

function minutesFromNowIso(minutes) {
  return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}

function isPastDate(value) {
  const time = Date.parse(value || "");
  return Number.isFinite(time) && time <= Date.now();
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

function safeText(value, fallback = "") {
  const text = String(value || "").trim();
  return text || fallback;
}

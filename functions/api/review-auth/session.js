import { error, getBucket, json } from "../../_shared/books.js";
import { applyRateLimit } from "../../_shared/rate-limit.js";
import {
  clearSessionCookieHeader,
  createReviewSession,
  getReviewAuthDecision,
  recordReviewLogout,
  reviewPasswordAuthEnabled,
  sessionCookieHeader,
  verifyReviewLogin
} from "../../_shared/review-auth.js";

export async function onRequestPost(context) {
  if (!reviewPasswordAuthEnabled(context.env)) {
    return json({ ok: true, authRequired: false, authenticated: true });
  }

  const rateLimited = applyRateLimit(context.request, context.env, "review_auth");
  if (rateLimited) return rateLimited;

  const bucket = getBucket(context.env);
  if (!bucket) return error("R2 bucket binding が未設定です", 500);

  const payload = await context.request.json().catch(() => null);
  const identifier = payload?.identifier || payload?.email || "";
  const password = payload?.password || "";
  const login = await verifyReviewLogin(bucket, context.env, identifier, password);
  if (!login.ok) {
    const status = login.reason === "secret-missing" ? 500 : 401;
    const message = status === 500
      ? "TSUKUYOMI_REVIEW_AUTH_SECRET または TSUKUYOMI_ADMIN_TOKEN が未設定です"
      : "メールアドレスまたはパスワードが違います";
    return error(message, status);
  }

  const session = await createReviewSession(login.entry, context.env);
  if (!session) return error("認証セッションを作成できませんでした", 500);

  return json(
    {
      ok: true,
      authRequired: true,
      authenticated: true,
      email: login.email,
      reviewerId: login.reviewerId || "",
      expiresAt: session.expiresAt
    },
    {
      headers: {
        "set-cookie": sessionCookieHeader(session.token, context.request, session.maxAge)
      }
    }
  );
}

export async function onRequestDelete(context) {
  const bucket = getBucket(context.env);
  if (bucket && reviewPasswordAuthEnabled(context.env)) {
    const decision = await getReviewAuthDecision(context.request, bucket, context.env);
    if (decision.ok && (decision.email || decision.reviewerId)) {
      await recordReviewLogout(bucket, decision);
    }
  }

  return json(
    { ok: true, authenticated: false },
    {
      headers: {
        "set-cookie": clearSessionCookieHeader(context.request)
      }
    }
  );
}

import { error, getBucket, json } from "../../_shared/books.js";
import { adminSessionCookieHeader, createAdminSession, verifyAdminOtp } from "../../_shared/admin-auth.js";
import { applyRateLimit } from "../../_shared/rate-limit.js";

export async function onRequestPost(context) {
  const rateLimited = applyRateLimit(context.request, context.env, "admin_auth_verify");
  if (rateLimited) return rateLimited;

  const bucket = getBucket(context.env);
  if (!bucket) return error("R2 bucket binding が未設定です", 500);

  const payload = await context.request.json().catch(() => null);
  const verified = await verifyAdminOtp(
    bucket,
    context.env,
    payload?.email || "",
    payload?.challengeId || "",
    payload?.otp || ""
  );
  if (!verified.ok) {
    const status = verified.reason === "secret-missing" ? 500 : 401;
    const message = status === 500 ? "TSUKUYOMI_ADMIN_AUTH_SECRET が未設定です" : "ログインコードが違います";
    return error(message, status);
  }

  const session = await createAdminSession(verified.email, context.env);
  if (!session) return error("管理セッションを作成できませんでした", 500);

  return json(
    {
      ok: true,
      authenticated: true,
      email: verified.email,
      expiresAt: session.expiresAt
    },
    {
      headers: {
        "set-cookie": adminSessionCookieHeader(session.token, context.request, session.maxAge)
      }
    }
  );
}

import { error, getBucket, json } from "../../_shared/books.js";
import { requestAdminOtp } from "../../_shared/admin-auth.js";
import { applyRateLimit } from "../../_shared/rate-limit.js";

export async function onRequestPost(context) {
  const rateLimited = applyRateLimit(context.request, context.env, "admin_auth_request");
  if (rateLimited) return rateLimited;

  const bucket = getBucket(context.env);
  if (!bucket) return error("R2 bucket binding が未設定です", 500);

  const payload = await context.request.json().catch(() => null);
  const result = await requestAdminOtp(bucket, context.env, payload?.email || "");
  if (!result.ok) return error(result.error || "OTPメール送信に失敗しました", 500);

  return json({
    ok: true,
    challengeId: result.challengeId,
    message: "許可された管理者メールの場合、ログインコードを送信しました。"
  });
}

import { error, getBucket, json, requireAdmin } from "../../../_shared/books.js";
import { issueReviewPassword, readReviewAuthLog, readReviewAuthSummary, revokeReviewPassword } from "../../../_shared/review-auth.js";

export async function onRequestPost(context) {
  const auth = await requireAdmin(context.request, context.env);
  if (!auth.ok) return auth.response;

  const bucket = getBucket(context.env);
  if (!bucket) return error("R2 bucket binding が未設定です", 500);

  const payload = await context.request.json().catch(() => null);
  if (!payload || typeof payload !== "object") return error("JSON body が必要です");

  const action = String(payload.action || "issue").trim().toLowerCase();
  const identifier = {
    email: payload.email || "",
    reviewerId: payload.reviewerId || payload.identifier || ""
  };
  const result = action === "revoke"
    ? await revokeReviewPassword(bucket, identifier)
    : await issueReviewPassword(bucket, identifier, context.env);

  const authLog = await readReviewAuthLog(bucket);
  const authSummary = await readReviewAuthSummary(bucket);
  if (!result.ok) {
    return json(
      { error: result.error || "パスワード操作に失敗しました", authLog, authSummary },
      { status: 400 }
    );
  }
  return json({ ok: true, action: action === "revoke" ? "revoke" : "issue", ...result, authLog, authSummary });
}

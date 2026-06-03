import { error, getBucket, json, requireAdmin } from "../../../_shared/books.js";
import { readReviewAccessList } from "../../../_shared/review-access.js";
import {
  issueReviewPassword,
  readReviewAuthLog,
  readReviewAuthSummary,
  recordReviewAuthEvent,
  revokeReviewPassword
} from "../../../_shared/review-auth.js";

export async function onRequestPost(context) {
  const auth = await requireAdmin(context.request, context.env);
  if (!auth.ok) return auth.response;

  const bucket = getBucket(context.env);
  if (!bucket) return error("R2 bucket binding が未設定です", 500);

  const payload = await context.request.json().catch(() => null);
  if (!payload || typeof payload !== "object") return error("JSON body が必要です");

  try {
    const action = String(payload.action || "issue").trim().toLowerCase();
    const identifier = resolvePayloadIdentifier(payload);
    const list = await readReviewAccessList(bucket, { includeSecrets: true });
    const target = list.entries.find((entry) => matchesPayloadIdentifier(entry, identifier));

    if (!target) {
      await recordReviewAuthEvent(bucket, {
        type: action === "revoke" ? "password-revoke-failed" : "password-issue-failed",
        result: "failed",
        ...eventIdentifier(payload),
        reason: "target-not-found"
      });
      const authLog = await readReviewAuthLog(bucket);
      const authSummary = await readReviewAuthSummary(bucket);
      return json(
        {
          error: "対象メールアドレスまたは仮IDが認証管理にありません",
          reason: "target-not-found",
          authLog,
          authSummary
        },
        { status: 400 }
      );
    }

    const resolvedIdentifier = {
      email: target.email || "",
      reviewerId: target.reviewerId || ""
    };
    const result = action === "revoke"
      ? await revokeReviewPassword(bucket, resolvedIdentifier)
      : await issueReviewPassword(bucket, resolvedIdentifier, context.env);

    const nextAuthLog = await readReviewAuthLog(bucket);
    const nextAuthSummary = await readReviewAuthSummary(bucket);
    if (!result.ok) {
      return json(
        {
          error: result.error || "パスワード操作に失敗しました",
          reason: result.reason || "",
          authLog: nextAuthLog,
          authSummary: nextAuthSummary
        },
        { status: 400 }
      );
    }
    return json({
      ok: true,
      action: action === "revoke" ? "revoke" : "issue",
      ...result,
      authLog: nextAuthLog,
      authSummary: nextAuthSummary
    });
  } catch (err) {
    return json(
      {
        error: "パスワード操作に失敗しました",
        detail: err instanceof Error ? err.message : String(err)
      },
      { status: 500 }
    );
  }
}

function resolvePayloadIdentifier(payload) {
  return [
    payload.email,
    payload.reviewerId,
    payload.identifier,
    payload.id
  ].map(normalizeLookupValue).filter(Boolean);
}

function matchesPayloadIdentifier(entry, identifiers) {
  if (!identifiers.length) return false;

  const targets = [
    entry?.email,
    entry?.reviewerId,
    entry?.id
  ].map(normalizeLookupValue).filter(Boolean);

  return identifiers.some((identifier) => targets.includes(identifier));
}

function normalizeLookupValue(value) {
  return String(value || "").trim().toLowerCase();
}

function eventIdentifier(payload) {
  return {
    email: String(payload.email || "").trim(),
    reviewerId: String(payload.reviewerId || payload.identifier || payload.id || "").trim()
  };
}

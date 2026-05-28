import { error, getBucket, json } from "../../_shared/books.js";
import {
  getReviewAuthDecision,
  reviewAuthPublicStatus,
  reviewPasswordAuthEnabled
} from "../../_shared/review-auth.js";

export async function onRequestGet(context) {
  if (!reviewPasswordAuthEnabled(context.env)) {
    return json({ authRequired: false, authenticated: true });
  }

  const bucket = getBucket(context.env);
  if (!bucket) return error("R2 bucket binding が未設定です", 500);

  const decision = await getReviewAuthDecision(context.request, bucket, context.env);
  if (!decision.ok && decision.reason === "secret-missing") return decision.response;

  return json(reviewAuthPublicStatus(decision));
}

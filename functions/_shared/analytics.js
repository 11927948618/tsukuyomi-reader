import { json } from "./books.js";

export const ANALYTICS_TABLE = "reader_events";

export function getAnalyticsDb(env) {
  return env.TSUKUYOMI_ANALYTICS_DB || env.ANALYTICS_DB || null;
}

export function analyticsDisabled(reason = "D1 analytics binding is not configured.") {
  return json({ enabled: false, reason });
}

export async function sha256Hex(value) {
  const data = new TextEncoder().encode(String(value || ""));
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function normalizeAnalyticsText(value, maxLength = 128) {
  return String(value || "")
    .trim()
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .slice(0, maxLength);
}

export function getAccessAnalyticsEmail(request, env) {
  if (!truthy(env?.TSUKUYOMI_ACCESS_IDENTITY_ANALYTICS || env?.ACCESS_IDENTITY_ANALYTICS)) {
    return "";
  }

  const email = normalizeAnalyticsText(
    request.headers.get("cf-access-authenticated-user-email") ||
      request.headers.get("cf-access-user"),
    160
  ).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

export function normalizeProgressPercent(value) {
  if (value == null || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.max(0, Math.min(100, Math.round(number)));
}

export function analyticsErrorResponse(err) {
  const message = String(err?.message || err || "");
  if (/no such table|no such column/i.test(message)) {
    return analyticsDisabled("D1 analytics table is not ready.");
  }
  return json({ error: "読書ログの処理に失敗しました" }, { status: 500 });
}

function truthy(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "on";
}

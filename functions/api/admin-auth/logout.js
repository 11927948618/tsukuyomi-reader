import { getBucket, json } from "../../_shared/books.js";
import { adminAuthStatus, clearAdminSessionCookieHeader, recordAdminLogout } from "../../_shared/admin-auth.js";

export async function onRequestPost(context) {
  const bucket = getBucket(context.env);
  const status = bucket ? await adminAuthStatus(context.request, context.env) : null;
  if (bucket && status?.authenticated && status.email) {
    await recordAdminLogout(bucket, status.email);
  }

  return json(
    { ok: true, authenticated: false },
    {
      headers: {
        "set-cookie": clearAdminSessionCookieHeader(context.request)
      }
    }
  );
}

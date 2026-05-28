import { json } from "../../_shared/books.js";
import { adminAuthStatus } from "../../_shared/admin-auth.js";

export async function onRequestGet(context) {
  return json(await adminAuthStatus(context.request, context.env));
}

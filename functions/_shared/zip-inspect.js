// Dependency-free inspection of a ZIP's tail (End Of Central Directory + Central Directory).
// Used by the admin upload to validate webapp packs without unzipping (no ZIP library in the Worker).
// NOTE: sizes in the central directory are *declared* values (a malicious zip can lie), which is acceptable
// here because only authenticated admins upload; this is a guard against mistakes, not a sandbox.
import { PACK_LIMITS, validatePackEntries } from "../../js/webapp/pack-validate.js";

const SIG_LOCAL = 0x04034b50;
const SIG_EOCD = 0x06054b50;
const SIG_CD = 0x02014b50;

/** Parse the central directory. Returns { ok:true, entries } or { ok:false, errors:[{code,message}] }. */
export function readZipEntries(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const fail = (code, message) => ({ ok: false, errors: [{ code, message }] });

  if (bytes.byteLength < 22) return fail("not-zip", "ZIPファイルではありません（小さすぎます）");
  if (view.getUint32(0, true) !== SIG_LOCAL) {
    if (view.getUint32(0, true) === SIG_EOCD) return fail("empty-pack", "パッケージにファイルがありません");
    return fail("not-zip", "ZIPファイルではありません（先頭の署名が不正です）");
  }

  let eocd = -1;
  const lowest = Math.max(0, bytes.byteLength - 22 - 0xffff);
  for (let i = bytes.byteLength - 22; i >= lowest; i -= 1) {
    if (view.getUint32(i, true) === SIG_EOCD) { eocd = i; break; }
  }
  if (eocd < 0) return fail("not-zip", "ZIPの終端情報が見つかりません（破損している可能性があります）");

  const diskNo = view.getUint16(eocd + 4, true);
  const cdDisk = view.getUint16(eocd + 6, true);
  const total = view.getUint16(eocd + 10, true);
  const cdSize = view.getUint32(eocd + 12, true);
  const cdOffset = view.getUint32(eocd + 16, true);
  if (diskNo !== 0 || cdDisk !== 0) return fail("split-zip", "分割ZIPは使用できません");
  if (total === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) return fail("zip64", "ZIP64形式は使用できません");
  if (cdOffset + cdSize > eocd) return fail("not-zip", "ZIPのディレクトリ情報が不正です");

  const decoder = new TextDecoder("utf-8", { fatal: true });
  const entries = [];
  let p = cdOffset;
  for (let n = 0; n < total; n += 1) {
    if (p + 46 > cdOffset + cdSize || view.getUint32(p, true) !== SIG_CD) return fail("not-zip", "ZIPのディレクトリ情報が不正です");
    const madeBy = view.getUint16(p + 4, true);
    const flags = view.getUint16(p + 8, true);
    const method = view.getUint16(p + 10, true);
    const compressedSize = view.getUint32(p + 20, true);
    const size = view.getUint32(p + 24, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const externalAttrs = view.getUint32(p + 38, true);
    const localOffset = view.getUint32(p + 42, true);
    if (p + 46 + nameLen + extraLen + commentLen > cdOffset + cdSize) return fail("not-zip", "ZIPのディレクトリ情報が不正です");
    if (flags & 0x1) return fail("encrypted", "暗号化されたZIPは使用できません");
    if (method !== 0 && method !== 8) return fail("method", `未対応の圧縮方式です (${method})`);
    if (compressedSize === 0xffffffff || size === 0xffffffff || localOffset === 0xffffffff) return fail("zip64", "ZIP64形式は使用できません");
    if (localOffset >= cdOffset) return fail("not-zip", "ZIPのローカルヘッダ位置が不正です");
    let name;
    try {
      name = decoder.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    } catch {
      return fail("name-encoding", "ファイル名は UTF-8 で保存してください");
    }
    const unixMode = (madeBy >> 8) === 3 ? (externalAttrs >>> 16) & 0xf000 : 0;
    if (unixMode === 0xa000) return fail("symlink", `シンボリックリンクは使用できません: ${name}`);
    entries.push({ name, size, compressedSize, method, dir: name.endsWith("/") });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return { ok: true, entries };
}

/**
 * Full admin-side check of an uploaded pack.
 * Returns { ok, errors:[{code,message}], summary:{ files, totalBytes, entry } }.
 */
export function inspectZip(buffer, { entry, limits = PACK_LIMITS } = {}) {
  const byteLength = buffer.byteLength ?? buffer.length ?? 0;
  if (byteLength > limits.zipBytes) {
    return { ok: false, errors: [{ code: "zip-too-large", message: `ZIPの上限(${Math.round(limits.zipBytes / 1048576)}MB)を超えています` }] };
  }
  const parsed = readZipEntries(buffer);
  if (!parsed.ok) return parsed;
  const result = validatePackEntries(parsed.entries, { entry, limits });
  return {
    ok: result.ok,
    errors: result.errors,
    summary: { files: result.files.length, totalBytes: result.totalBytes, entry: result.entry }
  };
}

export async function sha256Hex(buffer) {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

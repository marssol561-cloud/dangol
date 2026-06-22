import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
} from "crypto";

// Server-only module — never import from client components.

function getEncKey(): Buffer {
  const b64 = process.env.DANGOL_ENCRYPTION_SECRET;
  if (!b64) throw new Error("DANGOL_ENCRYPTION_SECRET not set");
  const key = Buffer.from(b64, "base64");
  if (key.length !== 32)
    throw new Error("DANGOL_ENCRYPTION_SECRET must decode to 32 bytes");
  return key;
}

function getHashSecret(): string {
  const s = process.env.DANGOL_HASH_SECRET;
  if (!s) throw new Error("DANGOL_HASH_SECRET not set");
  return s;
}

// ── Normalizers ──────────────────────────────────────────────

export function normalizePhone(s: string): string {
  return s.replace(/\D/g, "");
}

export function normalizeEmail(s: string): string {
  return s.trim().toLowerCase();
}

export function normalizeKakao(s: string): string {
  return s.trim();
}

function normalize(value: string, kind: "phone" | "email" | "kakao"): string {
  if (kind === "phone") return normalizePhone(value);
  if (kind === "email") return normalizeEmail(value);
  return normalizeKakao(value);
}

// ── HMAC-SHA256 hash (deterministic, for lookup/dedupe) ──────

export function hashPII(value: string, kind: "phone" | "email" | "kakao"): string {
  const normalized = normalize(value, kind);
  return createHmac("sha256", getHashSecret())
    .update(normalized, "utf8")
    .digest("hex");
}

// ── AES-256-GCM encryption ───────────────────────────────────
// Stored format: base64(iv[12] | ciphertext[*] | tag[16])

export function encryptPII(plain: string): string {
  const key = getEncKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([
    cipher.update(plain, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, ct, tag]).toString("base64");
}

export function decryptPII(enc: string): string {
  const key = getEncKey();
  const buf = Buffer.from(enc, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(buf.length - 16);
  const ct = buf.subarray(12, buf.length - 16);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}

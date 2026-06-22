// Server-only helpers to produce display-safe masked contact strings.
// Never returns raw plaintext or ciphertext.

export function maskPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 8) return "***-****-****";
  return digits.slice(0, 3) + "-****-" + digits.slice(-4);
}

export function maskEmail(raw: string): string {
  const atIdx = raw.indexOf("@");
  if (atIdx < 0) return raw.slice(0, 2) + "***";
  const local = raw.slice(0, atIdx);
  const domain = raw.slice(atIdx + 1);
  const maskedLocal = local.length > 2 ? local.slice(0, 2) + "***" : local[0] + "**";
  return maskedLocal + "@" + domain;
}

export function maskKakao(raw: string): string {
  if (raw.length <= 1) return raw + "*";
  return raw.slice(0, 2) + "***";
}

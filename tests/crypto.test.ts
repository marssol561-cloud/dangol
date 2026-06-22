import { describe, it, expect, beforeAll } from "vitest";
import { encryptPII, decryptPII, hashPII } from "@/lib/crypto";

beforeAll(() => {
  // Ensure secrets are set for tests
  if (!process.env.DANGOL_ENCRYPTION_SECRET) {
    throw new Error("DANGOL_ENCRYPTION_SECRET is required for crypto tests");
  }
  if (!process.env.DANGOL_HASH_SECRET) {
    throw new Error("DANGOL_HASH_SECRET is required for crypto tests");
  }
});

describe("test_crypto_roundtrip", () => {
  it("encryptPII → decryptPII restores original", () => {
    const plain = "01012345678";
    const enc = encryptPII(plain);
    const dec = decryptPII(enc);
    expect(dec).toBe(plain);
  });

  it("different plaintext inputs produce different ciphertext", () => {
    const a = encryptPII("aaa");
    const b = encryptPII("bbb");
    expect(a).not.toBe(b);
  });

  it("same input produces different ciphertext each call (random IV)", () => {
    const a = encryptPII("same");
    const b = encryptPII("same");
    expect(a).not.toBe(b);
  });

  it("hashPII is deterministic (same input → same hash)", () => {
    const h1 = hashPII("010-1234-5678", "phone");
    const h2 = hashPII("010-1234-5678", "phone");
    expect(h1).toBe(h2);
  });

  it("hashPII normalizes before hashing (dashes stripped for phone)", () => {
    const h1 = hashPII("010-1234-5678", "phone");
    const h2 = hashPII("01012345678", "phone");
    expect(h1).toBe(h2);
  });

  it("plaintext never equals stored enc", () => {
    const plain = "secret";
    const enc = encryptPII(plain);
    expect(enc).not.toBe(plain);
  });

  it("hashPII hex output does not contain plaintext", () => {
    const plain = "01099998888";
    const hash = hashPII(plain, "phone");
    expect(hash).not.toContain(plain);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

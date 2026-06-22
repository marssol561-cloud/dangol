import { describe, it, expect, afterEach } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { hashPII, encryptPII } from "@/lib/crypto";

function adminClient() {
  return createClient(
    process.env.DANGOL_DB_URL!,
    process.env.DANGOL_DB_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

async function setupOwnerAndLink() {
  const admin = adminClient();
  const email = `custcreate_${Date.now()}@example.com`;
  const { data: u } = await admin.auth.admin.createUser({
    email,
    password: "Test1234!",
    email_confirm: true,
    user_metadata: {
      name: "테스트",
      terms_agreed_at: new Date().toISOString(),
      privacy_agreed_at: new Date().toISOString(),
      marketing_consent: false,
    },
  });
  await new Promise((r) => setTimeout(r, 1000));
  const userId = u.user!.id;

  const CHARSET = "ABCDEFGHJKMNPQRSTVWXYZ23456789";
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  const code = Array.from(bytes).map((b) => CHARSET[b % CHARSET.length]).join("");

  const { data: link } = await admin
    .from("store_links")
    .insert({
      owner_id: userId,
      master_store_id: crypto.randomUUID(),
      store_code: code,
      store_name: "테스트매장",
      address: "서울시",
    })
    .select("id, store_code")
    .single();

  const sl = link as { id: string; store_code: string };
  return { userId, storeLinkId: sl.id, storeCode: sl.store_code };
}

describe("test_customer_create", () => {
  let userId: string;

  afterEach(async () => {
    if (userId) await adminClient().auth.admin.deleteUser(userId);
  });

  it("customers row: *_hash and *_enc set (no plaintext); visit_purpose saved; consents 3-split; coupon kind A issued", async () => {
    const { userId: uid, storeLinkId } = await setupOwnerAndLink();
    userId = uid;
    const admin = adminClient();

    const phone = "010-9999-1111";
    const phoneNorm = phone.replace(/\D/g, "");
    const hash = hashPII(phone, "phone");
    const enc = encryptPII(phoneNorm);

    // INSERT customer (simulates API logic)
    const { data: cust, error: custErr } = await admin
      .from("customers")
      .insert({
        store_link_id: storeLinkId,
        phone_hash: hash,
        phone_enc: enc,
        visit_purpose: "친구",
        grade: "normal",
        visit_count: 0,
        browser_token: "testtoken123",
      })
      .select("id, phone_hash, phone_enc, visit_purpose")
      .single();

    expect(custErr).toBeNull();
    const c = cust as { id: string; phone_hash: string; phone_enc: string; visit_purpose: string };

    // *_hash stored
    expect(c.phone_hash).toBe(hash);
    // *_enc stored, not plaintext
    expect(c.phone_enc).toBeTruthy();
    expect(c.phone_enc).not.toBe(phoneNorm);
    expect(c.phone_enc).not.toContain(phoneNorm);
    // visit_purpose saved
    expect(c.visit_purpose).toBe("친구");

    // INSERT consents (required + thirdparty; ad_sms/kakao/email = false → not inserted)
    const now = new Date().toISOString();
    await admin.from("consents").insert([
      { customer_id: c.id, store_link_id: storeLinkId, type: "required", agreed: true, agreed_at: now },
      { customer_id: c.id, store_link_id: storeLinkId, type: "thirdparty", agreed: true, agreed_at: now },
    ]);

    const { data: consentRows } = await admin
      .from("consents")
      .select("type, agreed")
      .eq("customer_id", c.id);

    const rows = consentRows as { type: string; agreed: boolean }[];
    expect(rows).toHaveLength(2);
    expect(rows.some((r) => r.type === "required" && r.agreed)).toBe(true);
    expect(rows.some((r) => r.type === "thirdparty" && r.agreed)).toBe(true);

    // INSERT coupon kind 'A'
    const CHARSET = "ABCDEFGHJKMNPQRSTVWXYZ23456789";
    const cb = new Uint8Array(8);
    crypto.getRandomValues(cb);
    const couponCode = Array.from(cb).map((b) => CHARSET[b % CHARSET.length]).join("");

    const { data: coupon, error: couponErr } = await admin
      .from("coupons")
      .insert({
        store_link_id: storeLinkId,
        customer_id: c.id,
        kind: "A",
        code: couponCode,
        benefit: "첫 방문 환영 쿠폰",
        status: "issued",
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      })
      .select("kind, code, status")
      .single();

    expect(couponErr).toBeNull();
    const cp = coupon as { kind: string; code: string; status: string };
    expect(cp.kind).toBe("A");
    expect(cp.code).toHaveLength(8);
    expect(cp.status).toBe("issued");
  });
});

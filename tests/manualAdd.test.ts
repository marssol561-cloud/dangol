import { describe, it, expect, beforeAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { hashPII, encryptPII, decryptPII } from "@/lib/crypto";

const DANGOL_DB_URL = process.env.DANGOL_DB_URL!;
const DANGOL_DB_SERVICE_ROLE_KEY = process.env.DANGOL_DB_SERVICE_ROLE_KEY!;

function adminClient() {
  return createClient(DANGOL_DB_URL, DANGOL_DB_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

let storeLinkId: string;
let ownerId: string;

const TEST_PHONE = "01056781234";
const TEST_EMAIL = "manual@test.local";

beforeAll(async () => {
  const admin = adminClient();
  const ts = Date.now();

  const { data: userD } = await admin.auth.admin.createUser({
    email: `manualadd-${ts}@test.local`,
    password: "Test1234!",
    email_confirm: true,
  });
  ownerId = userD.user!.id;

  const { data: sl } = await admin
    .from("store_links")
    .insert({ store_code: "MA" + ts.toString().slice(-5), store_name: "직접등록테스트", owner_id: ownerId, master_store_id: crypto.randomUUID(), address: "" })
    .select("id")
    .single();
  storeLinkId = (sl as { id: string }).id;
  await admin.from("owners").update({ store_link_id: storeLinkId, role: "owner" }).eq("id", ownerId);
});

// Simulate manual add logic (same as /api/customers/manual)
async function doManualAdd(
  channel: "phone" | "email" | "kakao",
  identifier: string,
  name?: string,
  adConsent = false
): Promise<{ customer_id: string } | { error: string }> {
  const admin = adminClient();
  const hash = hashPII(identifier, channel);
  const enc = encryptPII(identifier);
  const now = new Date().toISOString();

  // Dedup check
  const { data: existing } = await admin
    .from("customers")
    .select("id")
    .eq("store_link_id", storeLinkId)
    .eq(`${channel}_hash`, hash)
    .maybeSingle();
  if (existing) return { error: "duplicate" };

  const insertRow: Record<string, unknown> = {
    store_link_id: storeLinkId,
    name: name ?? null,
    grade: "normal",
    visit_count: 0,
    visit_purpose: "직접등록",
    [`${channel}_hash`]: hash,
    [`${channel}_enc`]: enc,
  };

  const { data: newC, error: insertErr } = await admin
    .from("customers")
    .insert(insertRow)
    .select("id")
    .single();
  if (insertErr || !newC) return { error: "insert failed" };

  const customerId = (newC as { id: string }).id;
  const consents = [
    { customer_id: customerId, store_link_id: storeLinkId, type: "required", agreed: true, agreed_at: now },
  ];
  if (adConsent) {
    const adType = channel === "phone" ? "ad_sms" : channel === "kakao" ? "ad_kakao" : "ad_email";
    consents.push({ customer_id: customerId, store_link_id: storeLinkId, type: adType, agreed: true, agreed_at: now });
  }
  await admin.from("consents").insert(consents);
  return { customer_id: customerId };
}

describe("manual add — phone channel", () => {
  it("stores phone_hash and phone_enc (not plaintext)", async () => {
    const result = await doManualAdd("phone", TEST_PHONE, "홍길동");
    expect("error" in result).toBe(false);
    if ("error" in result) return;

    const admin = adminClient();
    const { data: c } = await admin
      .from("customers")
      .select("phone_hash, phone_enc, name")
      .eq("id", result.customer_id)
      .single();
    const row = c as { phone_hash: string; phone_enc: string; name: string };

    // phone_enc is NOT the raw phone
    expect(row.phone_enc).not.toBe(TEST_PHONE);
    // phone_hash matches expected
    expect(row.phone_hash).toBe(hashPII(TEST_PHONE, "phone"));
    // decrypting phone_enc returns original
    expect(decryptPII(row.phone_enc)).toBe(TEST_PHONE);
    // name stored correctly
    expect(row.name).toBe("홍길동");
  });

  it("prevents duplicate registration (same phone, same store)", async () => {
    const result = await doManualAdd("phone", TEST_PHONE);
    expect("error" in result).toBe(true);
    if ("error" in result) expect(result.error).toBe("duplicate");
  });

  it("returns only customer_id, not plaintext contact", async () => {
    const result = await doManualAdd("phone", "01011112222");
    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(Object.keys(result)).toEqual(["customer_id"]);
    expect("identifier" in result).toBe(false);
    expect("phone" in result).toBe(false);
  });
});

describe("manual add — email channel", () => {
  it("stores email_hash and email_enc", async () => {
    const result = await doManualAdd("email", TEST_EMAIL);
    expect("error" in result).toBe(false);
    if ("error" in result) return;

    const admin = adminClient();
    const { data: c } = await admin
      .from("customers")
      .select("email_hash, email_enc")
      .eq("id", result.customer_id)
      .single();
    const row = c as { email_hash: string; email_enc: string };

    expect(row.email_enc).not.toBe(TEST_EMAIL);
    expect(row.email_hash).toBe(hashPII(TEST_EMAIL, "email"));
    expect(decryptPII(row.email_enc)).toBe(TEST_EMAIL);
  });
});

describe("manual add — consents", () => {
  it("creates required consent row", async () => {
    const result = await doManualAdd("phone", "01033334444");
    expect("error" in result).toBe(false);
    if ("error" in result) return;

    const admin = adminClient();
    const { data: consents } = await admin
      .from("consents")
      .select("type, agreed")
      .eq("customer_id", result.customer_id);
    const types = (consents ?? []).map((c: { type: string }) => c.type);
    expect(types).toContain("required");
  });

  it("creates ad consent when opted in", async () => {
    const result = await doManualAdd("phone", "01044445555", undefined, true);
    expect("error" in result).toBe(false);
    if ("error" in result) return;

    const admin = adminClient();
    const { data: consents } = await admin
      .from("consents")
      .select("type, agreed")
      .eq("customer_id", result.customer_id);
    const types = (consents ?? []).map((c: { type: string }) => c.type);
    expect(types).toContain("ad_sms");
  });
});

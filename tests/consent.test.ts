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

async function setupOwnerLinkCustomer() {
  const admin = adminClient();
  const email = `consent_${Date.now()}@example.com`;
  const { data: u } = await admin.auth.admin.createUser({
    email,
    password: "Test1234!",
    email_confirm: true,
    user_metadata: {
      name: "동의테스트",
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
      store_name: "동의테스트매장",
      address: "서울",
    })
    .select("id")
    .single();

  const storeLinkId = (link as { id: string }).id;

  const { data: cust } = await admin
    .from("customers")
    .insert({
      store_link_id: storeLinkId,
      phone_hash: hashPII("01077779999", "phone"),
      phone_enc: encryptPII("01077779999"),
      visit_purpose: "연인",
      grade: "normal",
      visit_count: 0,
      browser_token: "bt_consent",
      unsub_token: crypto.randomUUID(),
    })
    .select("id")
    .single();

  return { userId, storeLinkId, customerId: (cust as { id: string }).id };
}

describe("test_consent_3split", () => {
  let userId: string;

  afterEach(async () => {
    if (userId) await adminClient().auth.admin.deleteUser(userId);
  });

  it("required=true stored agreed; optional thirdparty/ad per input; unchecked optional not stored as agreed", async () => {
    const { userId: uid, storeLinkId, customerId } = await setupOwnerLinkCustomer();
    userId = uid;
    const admin = adminClient();

    const now = new Date().toISOString();

    // required=true, thirdparty=true, ad_sms=false, ad_kakao=true, ad_email=false
    const inputConsents: Record<string, boolean> = {
      required: true,
      thirdparty: true,
      ad_sms: false,
      ad_kakao: true,
      ad_email: false,
    };

    const toInsert = Object.entries(inputConsents)
      .filter(([, agreed]) => agreed)
      .map(([type]) => ({
        customer_id: customerId,
        store_link_id: storeLinkId,
        type,
        agreed: true,
        agreed_at: now,
      }));

    const { error: insErr } = await admin.from("consents").insert(toInsert);
    expect(insErr).toBeNull();

    const { data: rows } = await admin
      .from("consents")
      .select("type, agreed, agreed_at")
      .eq("customer_id", customerId);

    const r = rows as { type: string; agreed: boolean; agreed_at: string }[];

    // required stored as agreed
    const req = r.find((x) => x.type === "required");
    expect(req).toBeTruthy();
    expect(req!.agreed).toBe(true);
    expect(req!.agreed_at).toBeTruthy();

    // thirdparty agreed
    expect(r.some((x) => x.type === "thirdparty" && x.agreed)).toBe(true);

    // ad_kakao agreed
    expect(r.some((x) => x.type === "ad_kakao" && x.agreed)).toBe(true);

    // ad_sms NOT stored (false → not inserted)
    expect(r.some((x) => x.type === "ad_sms")).toBe(false);

    // ad_email NOT stored (false → not inserted)
    expect(r.some((x) => x.type === "ad_email")).toBe(false);

    // Total 3 rows
    expect(r.length).toBe(3);
  });
});

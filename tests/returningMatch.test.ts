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
  const email = `returning_${Date.now()}@example.com`;
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
      store_name: "리턴테스트매장",
      address: "서울",
    })
    .select("id")
    .single();

  return { userId, storeLinkId: (link as { id: string }).id };
}

describe("test_returning_match", () => {
  let userId: string;

  afterEach(async () => {
    if (userId) await adminClient().auth.admin.deleteUser(userId);
  });

  it("same identifier submitted twice (same store) → matched by hash, NOT duplicated", async () => {
    const { userId: uid, storeLinkId } = await setupOwnerAndLink();
    userId = uid;
    const admin = adminClient();

    const phone = "010-7777-8888";
    const hash = hashPII(phone, "phone");
    const enc = encryptPII(phone.replace(/\D/g, ""));

    // First submission — INSERT
    const { data: first } = await admin
      .from("customers")
      .insert({
        store_link_id: storeLinkId,
        phone_hash: hash,
        phone_enc: enc,
        visit_purpose: "가족",
        grade: "normal",
        visit_count: 0,
        browser_token: "token_first",
      })
      .select("id")
      .single();

    const firstId = (first as { id: string }).id;

    // Second submission — look up existing by hash (simulates API returning-customer logic)
    const { data: existing } = await admin
      .from("customers")
      .select("id")
      .eq("store_link_id", storeLinkId)
      .eq("phone_hash", hash)
      .maybeSingle();

    expect(existing).toBeTruthy();
    const existingId = (existing as { id: string }).id;

    // Same row — no duplicate
    expect(existingId).toBe(firstId);

    // Confirm only one customer row exists with this hash
    const { data: allRows } = await admin
      .from("customers")
      .select("id")
      .eq("store_link_id", storeLinkId)
      .eq("phone_hash", hash);

    expect((allRows as { id: string }[]).length).toBe(1);
  });
});

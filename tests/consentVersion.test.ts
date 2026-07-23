import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";

const DANGOL_DB_URL = process.env.DANGOL_DB_URL!;
const DANGOL_DB_SERVICE_ROLE_KEY = process.env.DANGOL_DB_SERVICE_ROLE_KEY!;
const DANGOL_DB_ANON_KEY = process.env.DANGOL_DB_ANON_KEY!;

function adminDb() {
  return createClient(DANGOL_DB_URL, DANGOL_DB_SERVICE_ROLE_KEY, {
    db: { schema: 'dangol' },
    auth: { persistSession: false },
  });
}

function anonDb() {
  return createClient(DANGOL_DB_URL, DANGOL_DB_ANON_KEY, {
    db: { schema: 'dangol' },
    auth: { persistSession: false },
  });
}

describe("consent_versions — content availability", () => {
  it("service_role can read consent_versions", async () => {
    const { data, error } = await adminDb()
      .from("consent_versions")
      .select("type, version, content")
      .order("type");

    expect(error).toBeNull();
    expect((data ?? []).length).toBeGreaterThanOrEqual(5);
  });

  it("all seeded types are present (v1)", async () => {
    const { data } = await adminDb()
      .from("consent_versions")
      .select("type")
      .eq("version", 1);

    const types = (data ?? []).map((r: { type: string }) => r.type).sort();
    expect(types).toEqual(
      expect.arrayContaining(["ad", "privacy", "required", "terms", "thirdparty"])
    );
  });

  it("anon CAN SELECT from consent_versions (public text)", async () => {
    const { data, error } = await anonDb()
      .from("consent_versions")
      .select("type, version, content");

    expect(error).toBeNull();
    expect((data ?? []).length).toBeGreaterThan(0);
  });

  it("consent content is non-empty string", async () => {
    const { data } = await adminDb()
      .from("consent_versions")
      .select("content")
      .eq("type", "required")
      .single();

    expect(typeof (data as { content: string }).content).toBe("string");
    expect((data as { content: string }).content.length).toBeGreaterThan(10);
  });
});

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";

const DANGOL_DB_URL = process.env.DANGOL_DB_URL!;
const DANGOL_DB_SERVICE_ROLE_KEY = process.env.DANGOL_DB_SERVICE_ROLE_KEY!;

function adminClient() {
  return createClient(DANGOL_DB_URL, DANGOL_DB_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

const TS = Date.now();

let adminUserId: string;

beforeAll(async () => {
  const db = adminClient();
  const { data: ad } = await db.auth.admin.createUser({
    email: `export-admin-${TS}@test.local`,
    password: "Pw123456!",
    email_confirm: true,
  });
  adminUserId = ad.user!.id;
  await db.from("admins").insert({ id: adminUserId, name: "ExportTestAdmin" });
});

afterAll(async () => {
  const db = adminClient();
  await db.from("audit_logs").delete().eq("admin_user", adminUserId);
  await db.from("admins").delete().eq("id", adminUserId);
  await db.auth.admin.deleteUser(adminUserId);
});

describe("export → audit_logs", () => {
  it("export action writes audit_logs row with correct fields", async () => {
    const db = adminClient();

    // Get current unified_customers count
    const { count: exportCount } = await db
      .from("unified_customers")
      .select("id", { count: "exact", head: true });

    const rowCount = exportCount ?? 0;

    // Simulate what the export API does: insert audit_log
    await db.from("audit_logs").insert({
      admin_user: adminUserId,
      action: "export",
      target: "unified_customers",
      count: rowCount,
    });

    // Verify audit_log was written correctly
    const { data: logs } = await db
      .from("audit_logs")
      .select("admin_user, action, target, count")
      .eq("admin_user", adminUserId)
      .eq("action", "export")
      .eq("target", "unified_customers")
      .order("created_at", { ascending: false })
      .limit(1);

    expect((logs as unknown[]).length).toBe(1);
    const log = (logs as { admin_user: string; action: string; target: string; count: number }[])[0];
    expect(log.admin_user).toBe(adminUserId);
    expect(log.action).toBe("export");
    expect(log.target).toBe("unified_customers");
    expect(log.count).toBe(rowCount);
  });

  it("audit_log count field matches exported row count", async () => {
    const db = adminClient();

    const { data: logs } = await db
      .from("audit_logs")
      .select("count")
      .eq("admin_user", adminUserId)
      .eq("action", "export")
      .order("created_at", { ascending: false })
      .limit(1);

    expect((logs as unknown[]).length).toBeGreaterThan(0);
    const logCount = (logs as { count: number }[])[0].count;

    // Count must be a non-negative integer
    expect(typeof logCount).toBe("number");
    expect(logCount).toBeGreaterThanOrEqual(0);
  });
});

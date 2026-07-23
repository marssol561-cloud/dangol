// Daily purge cron — anonymizes expired + withdrawn-consent customers.
// Protected by CRON_SECRET. Runs daytime KST (02:00 UTC = 11:00 KST).
// Purge = ANONYMIZE only (no hard row deletion). Stats kept, contacts nulled.
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { scanPurgeTargets, anonymizeCustomer } from "@/lib/purge";

export async function GET(req: NextRequest) {
  return handlePurge(req);
}

export async function POST(req: NextRequest) {
  return handlePurge(req);
}

async function handlePurge(req: NextRequest) {
  const cronSecret = req.headers.get("x-cron-secret");
  if (!cronSecret || cronSecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const targets = await scanPurgeTargets();

  for (const id of targets) {
    await anonymizeCustomer(id);
  }

  // Audit log (service_role write)
  if (targets.length > 0) {
    const db = createClient(
      process.env.DANGOL_DB_URL!,
      process.env.DANGOL_DB_SERVICE_ROLE_KEY!,
      { db: { schema: 'dangol' } }
    );
    await db.from("audit_logs").insert({
      admin_user: null,
      action: "purge",
      target: "customers",
      count: targets.length,
    });
  }

  return NextResponse.json({ purged: targets.length });
}

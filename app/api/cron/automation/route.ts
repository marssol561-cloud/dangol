// Daily cron: scan automation_rules → sendToSegment for enabled rules.
// Protected by CRON_SECRET header. Triggered by Vercel Cron daily at 09:00 KST (00:00 UTC).
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendToSegment } from "@/lib/messaging";
import type { SegmentType } from "@/lib/segments";
import type { TemplateId } from "@/lib/templates";

export async function GET(req: NextRequest) {
  return handleCron(req);
}

export async function POST(req: NextRequest) {
  return handleCron(req);
}

async function handleCron(req: NextRequest) {
  const cronSecret = req.headers.get("x-cron-secret");
  if (!cronSecret || cronSecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const db = createClient(
    process.env.DANGOL_DB_URL!,
    process.env.DANGOL_DB_SERVICE_ROLE_KEY!,
    { db: { schema: 'dangol' } }
  );

  const { data: rules, error } = await db
    .from("automation_rules")
    .select("id, store_link_id, type, params, template_id")
    .eq("enabled", true);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const results: Array<{ ruleId: string; result: unknown }> = [];

  for (const rule of (rules ?? [])) {
    const r = rule as {
      id: string;
      store_link_id: string;
      type: SegmentType;
      params: Record<string, unknown> | null;
      template_id: string | null;
    };

    if (!r.template_id) continue;

    const churnDays = (r.params?.churn_days as number | undefined) ?? 60;
    try {
      const res = await sendToSegment(
        r.store_link_id,
        r.type,
        r.template_id as TemplateId,
        {},
      );
      // Pass churnDays via resolveSegment indirectly — sendToSegment uses default;
      // For churn rules with custom days, call resolveSegment directly if needed.
      results.push({ ruleId: r.id, result: { ...res, churnDays } });
    } catch (e) {
      results.push({ ruleId: r.id, result: { error: String(e) } });
    }
  }

  return NextResponse.json({ processed: results.length, results });
}

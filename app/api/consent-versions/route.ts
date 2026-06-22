// Public — returns current consent text versions.
// Anon SELECT is allowed on consent_versions (non-personal public text).
import { NextResponse } from "next/server";
import { getServerClient } from "@/lib/dangolDb";

export async function GET() {
  const db = getServerClient();

  // Fetch the latest version per type
  const { data, error } = await db
    .from("consent_versions")
    .select("type, version, content, effective_at")
    .order("version", { ascending: false });

  if (error) {
    return NextResponse.json({ error: "조회 실패" }, { status: 500 });
  }

  // Deduplicate — keep highest version per type
  const seen = new Set<string>();
  const current: Array<{ type: string; version: number; content: string; effective_at: string }> = [];

  for (const row of (data ?? []) as { type: string; version: number; content: string; effective_at: string }[]) {
    if (!seen.has(row.type)) {
      seen.add(row.type);
      current.push(row);
    }
  }

  return NextResponse.json({ versions: current });
}

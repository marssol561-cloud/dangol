import { NextRequest, NextResponse } from "next/server";
import { getOwnerContext } from "@/lib/ownerAuth";
import { getServerClient } from "@/lib/dangolDb";

export async function POST(req: NextRequest) {
  const ctx = await getOwnerContext();
  if (!ctx || ctx.role !== "owner") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { email: string; password: string; name?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad request" }, { status: 400 }); }

  const { email, password, name } = body;
  if (!email || !password) return NextResponse.json({ error: "email and password required" }, { status: 400 });

  const db = getServerClient();
  const now = new Date().toISOString();

  // Create auth user
  const { data: createData, error: createError } = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name: name ?? "", terms_agreed_at: now, privacy_agreed_at: now, marketing_consent: false },
  });

  if (createError || !createData.user) {
    const msg = createError?.message ?? "User creation failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const newUserId = createData.user.id;

  // Give trigger time to fire, then upsert owners row with role=staff
  await new Promise((r) => setTimeout(r, 500));

  const { error: upsertErr } = await db.from("owners").upsert(
    {
      id: newUserId,
      email,
      name: name ?? null,
      role: "staff",
      store_link_id: ctx.storeLinkId,
      terms_agreed_at: now,
      privacy_agreed_at: now,
      marketing_consent: false,
    },
    { onConflict: "id" }
  );

  if (upsertErr) {
    // Rollback auth user
    await db.auth.admin.deleteUser(newUserId).catch(() => {});
    return NextResponse.json({ error: "Staff setup failed" }, { status: 500 });
  }

  // NEVER log password
  return NextResponse.json({ staff_id: newUserId, email }, { status: 201 });
}

export async function GET(_req: NextRequest) {
  const ctx = await getOwnerContext();
  if (!ctx || ctx.role !== "owner") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getServerClient();
  const { data: staffList } = await db
    .from("owners")
    .select("id, email, name, role, created_at")
    .eq("store_link_id", ctx.storeLinkId)
    .eq("role", "staff")
    .order("created_at", { ascending: true });

  return NextResponse.json({ staff: staffList ?? [] });
}

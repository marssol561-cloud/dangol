import { getServerClient } from "./dangolDb";
import { computeGrade, type Grade } from "./grade";
import { issueReturningCoupon } from "./coupons";

export const CHECKIN_MIN_GAP_HOURS = 6;

export type CheckInResult =
  | { accrued: false; reason: "no_customer" | "too_soon" }
  | {
      accrued: true;
      visit_count: number;
      grade: Grade;
      coupon?: { id: string; code: string; benefit: string; expires_at: string };
    };

export async function checkInCustomer(
  browserToken: string,
  storeCode: string
): Promise<CheckInResult> {
  const db = getServerClient();

  // Resolve store_link_id
  const { data: storeLink } = await db
    .from("store_links")
    .select("id")
    .eq("store_code", storeCode)
    .maybeSingle();

  if (!storeLink) return { accrued: false, reason: "no_customer" };
  const storeLinkId = (storeLink as { id: string }).id;

  // Resolve customer
  const { data: customer } = await db
    .from("customers")
    .select("id, visit_count, last_visit_at")
    .eq("store_link_id", storeLinkId)
    .eq("browser_token", browserToken)
    .maybeSingle();

  if (!customer) return { accrued: false, reason: "no_customer" };

  const c = customer as { id: string; visit_count: number; last_visit_at: string | null };

  // 6h dedupe guard
  if (c.last_visit_at) {
    const gapMs = CHECKIN_MIN_GAP_HOURS * 60 * 60 * 1000;
    if (Date.now() - new Date(c.last_visit_at).getTime() < gapMs) {
      return { accrued: false, reason: "too_soon" };
    }
  }

  // INSERT visit row
  await db.from("visits").insert({
    customer_id: c.id,
    store_link_id: storeLinkId,
    stamp_delta: 1,
    source: "checkin",
  });

  // Update customer: visit_count++, last_visit_at, grade
  const newCount = c.visit_count + 1;
  const newGrade = computeGrade(newCount);

  await db
    .from("customers")
    .update({
      visit_count: newCount,
      last_visit_at: new Date().toISOString(),
      grade: newGrade,
    })
    .eq("id", c.id);

  // Issue returning coupon B (skip if unused B exists)
  const coupon = await issueReturningCoupon(c.id, storeLinkId);

  return {
    accrued: true,
    visit_count: newCount,
    grade: newGrade,
    ...(coupon ? { coupon } : {}),
  };
}

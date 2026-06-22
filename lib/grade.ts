export type Grade = "vip" | "regular" | "normal";

export function computeGrade(visitCount: number): Grade {
  if (visitCount >= 50) return "vip";
  if (visitCount >= 20) return "regular";
  return "normal";
}

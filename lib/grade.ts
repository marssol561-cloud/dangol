export type Grade = "vip" | "regular" | "normal";

export function computeGrade(visitCount: number): Grade {
  if (visitCount >= 50) return "vip";
  if (visitCount >= 20) return "regular";
  return "normal";
}

// For display: cumulative OR monthly visits (whichever earns higher grade)
export function computeGradeDisplay(cumulativeVisits: number, monthlyVisits: number): Grade {
  if (cumulativeVisits >= 50 || monthlyVisits >= 5) return "vip";
  if (cumulativeVisits >= 20 || monthlyVisits >= 2) return "regular";
  return "normal";
}

export const GRADE_LABEL: Record<Grade, string> = {
  vip: "VIP",
  regular: "단골",
  normal: "일반",
};

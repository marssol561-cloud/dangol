import { describe, it, expect } from "vitest";
import { computeGrade } from "@/lib/grade";

describe("computeGrade", () => {
  it("50 → vip", () => expect(computeGrade(50)).toBe("vip"));
  it("49 → regular", () => expect(computeGrade(49)).toBe("regular"));
  it("20 → regular", () => expect(computeGrade(20)).toBe("regular"));
  it("5 → normal", () => expect(computeGrade(5)).toBe("normal"));
  it("0 → normal", () => expect(computeGrade(0)).toBe("normal"));
  it("100 → vip", () => expect(computeGrade(100)).toBe("vip"));
});

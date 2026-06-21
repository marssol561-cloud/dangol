import { describe, it, expect } from "vitest";
import { GET } from "../app/api/health/route";

describe("test_health_returns_ok", () => {
  it("GET /api/health → 200 and status=ok", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("ok");
    expect(typeof body.ts).toBe("string");
  });
});

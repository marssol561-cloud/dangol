import { describe, it, expect } from "vitest";
import { getAnonClient } from "../lib/dangolDb";

describe("test_rls_anon_blocked", () => {
  it("anon client cannot read app_meta (0 rows or permission error)", async () => {
    const client = getAnonClient();
    const { data, error } = await client.from("app_meta").select("*");

    if (error) {
      // RLS permission denied — 통과
      expect(error).toBeTruthy();
    } else {
      // RLS가 SELECT를 허용하지 않아 빈 배열 반환 — 통과
      expect(data).toHaveLength(0);
    }
  });
});

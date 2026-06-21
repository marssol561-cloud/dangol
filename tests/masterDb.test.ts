import { describe, it, expect } from "vitest";
import { getMasterStoresSample } from "../lib/masterDb";

describe("test_master_db_read", () => {
  it("getMasterStoresSample(1) → length 1, exact 3 keys", async () => {
    const rows = await getMasterStoresSample(1);
    expect(Array.isArray(rows)).toBe(true);
    expect(rows).toHaveLength(1);

    const row = rows[0];
    expect(Object.keys(row).sort()).toEqual(["address", "name", "store_id"]);
    expect(typeof row.store_id).toBe("string");
    expect(typeof row.name).toBe("string");
    expect(typeof row.address).toBe("string");
  });
});

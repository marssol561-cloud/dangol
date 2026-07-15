import { describe, it, expect } from "vitest";
import { getServerClient } from "../lib/dangolDb";
import { expectedSchemaVersion } from "./setup";

describe("test_dangol_db_connection", () => {
  it("service client reads schema_version from app_meta (matches latest migration file)", async () => {
    const client = getServerClient();
    const { data, error } = await client
      .from("app_meta")
      .select("value")
      .eq("key", "schema_version")
      .single();

    expect(error).toBeNull();
    expect(data?.value).toBe(expectedSchemaVersion());
  });
});

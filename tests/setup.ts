import { config } from "dotenv";
import path from "path";
import { readdirSync } from "fs";

// .env.local 우선 로드 (없으면 .env 시도)
config({ path: path.resolve(process.cwd(), ".env.local") });
config({ path: path.resolve(process.cwd(), ".env") });

/**
 * supabase/migrations/ 내 최고 번호 파일(3자리 zero-padded prefix)에서
 * 기대 schema_version을 도출 — 마이그레이션 추가 시 하드코딩 재파손 방지.
 */
export function expectedSchemaVersion(): string {
  const dir = path.resolve(process.cwd(), "supabase/migrations");
  const versions = readdirSync(dir)
    .filter((f) => /^\d{3}_.*\.sql$/.test(f))
    .map((f) => f.slice(0, 3))
    .sort();
  return versions[versions.length - 1];
}

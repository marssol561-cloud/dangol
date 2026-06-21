import { config } from "dotenv";
import path from "path";

// .env.local 우선 로드 (없으면 .env 시도)
config({ path: path.resolve(process.cwd(), ".env.local") });
config({ path: path.resolve(process.cwd(), ".env") });

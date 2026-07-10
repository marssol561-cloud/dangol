import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    '/api/qr': ['./app/api/qr/fonts/*.ttf'],
  },
};

export default withSentryConfig(nextConfig, {
  silent: true,
  disableLogger: true,
  // DSN이 없으면 Sentry 비활성화
  org: undefined,
  project: undefined,
});

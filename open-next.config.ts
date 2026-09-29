import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Every page is dynamic (session cookie + live data), so no incremental cache is configured.
const config = defineCloudflareConfig();

// `npm run build` is `opennextjs-cloudflare build`, so OpenNext must run plain `next build`
// itself (otherwise it would call `npm run build` recursively).
export default { ...config, buildCommand: "npm run next:build" };

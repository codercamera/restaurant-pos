import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Every page is dynamic (session cookie + live data), so no incremental cache is configured.
export default defineCloudflareConfig();

import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

// Lets `next dev` reach Cloudflare bindings (the D1 database) through wrangler's local emulation.
initOpenNextCloudflareForDev();

const nextConfig: NextConfig = {};

export default nextConfig;

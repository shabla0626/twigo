import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/env";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/admin", "/community", "/account", "/login", "/activate", "/reset-password", "/verify-email", "/api"] }],
    sitemap: siteUrl("/sitemap.xml"),
  };
}

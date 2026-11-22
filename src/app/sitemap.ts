import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/env";

const PATHS = [
  "/",
  "/about",
  "/how-it-works",
  "/participation",
  "/compensation",
  "/founding-contributors",
  "/faq",
  "/contact",
  "/work-with-us",
  "/community-rules",
  "/join",
  "/privacy",
  "/terms",
];

export default function sitemap(): MetadataRoute.Sitemap {
  return PATHS.map((p) => ({
    url: siteUrl(p),
    changeFrequency: "monthly",
    priority: p === "/" ? 1 : p === "/join" ? 0.9 : 0.7,
  }));
}

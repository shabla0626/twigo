import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/env";

const PATHS = [
  "/",
  "/about",
  "/operators",
  "/how-it-works",
  "/participation",
  "/compensation",
  "/founding-contributors",
  "/faq",
  "/contact",
  "/work-with-us",
  "/support",
  "/join",
  "/legal",
  "/legal/terms",
  "/legal/privacy",
  "/legal/community-guidelines",
  "/legal/intellectual-property",
  "/legal/participation-compensation",
  "/legal/group-participation",
  "/legal/cookies",
  "/legal/community-support",
  "/legal/notices",
];

export default function sitemap(): MetadataRoute.Sitemap {
  return PATHS.map((p) => ({
    url: siteUrl(p),
    changeFrequency: "monthly",
    priority: p === "/" ? 1 : p === "/join" ? 0.9 : 0.7,
  }));
}

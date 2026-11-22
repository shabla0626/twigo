// Detects a file's real type from its first bytes (never trusts the browser's
// Content-Type or the file name alone). Only an allow-list is accepted.

export type Sniffed = { mime: string; ext: string; kind: "image" | "document"; inline: boolean };

const startsWith = (b: Uint8Array, sig: number[], offset = 0) => sig.every((v, i) => b[offset + i] === v);

const OFFICE: Record<string, string> = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

const TEXT: Record<string, string> = { txt: "text/plain", csv: "text/csv", md: "text/markdown" };

function extOf(name: string) {
  const m = /\.([a-z0-9]{1,8})$/i.exec(name);
  return m ? m[1]!.toLowerCase() : "";
}

function looksLikeText(b: Uint8Array): boolean {
  const sample = b.subarray(0, Math.min(b.length, 64 * 1024));
  if (sample.includes(0)) return false;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(sample.length === b.length ? sample : sample.subarray(0, sample.length - 4));
  } catch {
    return false;
  }
  const head = new TextDecoder().decode(sample.subarray(0, 512)).trimStart().toLowerCase();
  // Markup that a browser could render as a page is never accepted as "text".
  return !/^(<!doctype|<html|<svg|<\?xml|<script)/.test(head);
}

export function sniff(bytes: Uint8Array, fileName: string): Sniffed | null {
  const ext = extOf(fileName);
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { mime: "image/png", ext: "png", kind: "image", inline: true };
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return { mime: "image/jpeg", ext: "jpg", kind: "image", inline: true };
  if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38])) return { mime: "image/gif", ext: "gif", kind: "image", inline: true };
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) return { mime: "image/webp", ext: "webp", kind: "image", inline: true };
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return { mime: "application/pdf", ext: "pdf", kind: "document", inline: false };
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]) && OFFICE[ext]) return { mime: OFFICE[ext]!, ext, kind: "document", inline: false };
  if (TEXT[ext] && looksLikeText(bytes)) return { mime: TEXT[ext]!, ext, kind: "document", inline: false };
  return null;
}

export const ALLOWED_DESCRIPTION = "PNG, JPG, GIF, WebP, PDF, Word, Excel, PowerPoint, TXT, CSV or Markdown";

/** File name safe for Content-Disposition (ASCII, no path or control characters). */
export function safeFileName(name: string, ext: string): string {
  const base = name
    .replace(/\.[^.]*$/, "")
    .normalize("NFKD")
    .replace(/[^\w\- ]+/g, "")
    .trim()
    .slice(0, 80);
  return `${base || "file"}.${ext}`;
}

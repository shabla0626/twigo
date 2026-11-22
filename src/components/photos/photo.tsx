import "server-only";
import { existsSync } from "node:fs";
import path from "node:path";
import Image from "next/image";
import type { ReactNode } from "react";
import { ASPECT_RATIO, PHOTOS, type Aspect, type PhotoId, type PhotoSlot } from "@/content/photos";
import { cn } from "../ui/primitives";

const isDev = process.env.NODE_ENV !== "production";
const cache = new Map<string, boolean>();

/** True if the owner has added the photo file under /public. */
export function photoAvailable(id: PhotoId): boolean {
  const src = PHOTOS[id].src;
  if (!isDev && cache.has(src)) return cache.get(src)!;
  const exists = existsSync(path.join(process.cwd(), "public", src));
  if (!isDev) cache.set(src, exists);
  return exists;
}

export function anyPhotoAvailable(): boolean {
  return (Object.keys(PHOTOS) as PhotoId[]).some(photoAvailable);
}

/**
 * Responsive photograph for a manifest slot.
 * - File present: optimized next/image, cropped to the slot's aspect ratio.
 * - File missing, development: a clearly labelled placeholder with the brief.
 * - File missing, production: the supplied fallback (original illustration)
 *   or a soft neutral panel. Never a broken image.
 */
export function Photo({
  id,
  sizes,
  priority = false,
  aspect,
  className,
  fallback,
  rounded = "rounded-2xl",
}: {
  id: PhotoId;
  /** Responsive `sizes` attribute, e.g. "(min-width: 1024px) 50vw, 100vw". */
  sizes: string;
  priority?: boolean;
  /** Override the slot's default aspect ratio for this layout. */
  aspect?: Aspect;
  className?: string;
  fallback?: ReactNode;
  rounded?: string;
}) {
  const slot: PhotoSlot = PHOTOS[id];
  const ratio = ASPECT_RATIO[aspect ?? slot.aspect];
  const box = cn("relative w-full overflow-hidden", rounded, className);

  if (photoAvailable(id)) {
    return (
      <div className={cn(box, "bg-ink-100")} style={{ aspectRatio: ratio }}>
        <Image
          src={slot.src}
          alt={slot.alt}
          fill
          sizes={sizes}
          priority={priority}
          className="object-cover"
          style={{ objectPosition: slot.focal ?? "50% 50%" }}
        />
      </div>
    );
  }

  if (isDev) {
    return (
      <div
        className={cn(box, "flex flex-col items-center justify-center gap-2 border-2 border-dashed border-accent-300 bg-accent-50 p-4 text-center")}
        style={{ aspectRatio: ratio }}
        role="img"
        aria-label={`Photo placeholder: ${slot.alt}`}
        data-photo-placeholder={id}
      >
        <svg viewBox="0 0 24 24" className="h-8 w-8 text-accent-600" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
          <circle cx="12" cy="13" r="3.5" />
        </svg>
        <p className="text-xs font-semibold uppercase tracking-wider text-accent-800">Photo placeholder · {id}</p>
        <p className="line-clamp-3 max-w-xs text-xs leading-5 text-ink-600">{slot.brief}</p>
        <p className="break-all font-mono text-[10px] text-ink-500">
          public{slot.src} · {aspect ?? slot.aspect} · ≥{slot.minWidth}px
        </p>
      </div>
    );
  }

  return (
    <div
      className={cn(box, "flex items-center justify-center bg-gradient-to-br from-sky-50 via-white to-accent-50 p-6")}
      style={{ aspectRatio: ratio }}
      data-photo-fallback={id}
    >
      {fallback ?? (
        <svg viewBox="0 0 24 24" className="h-10 w-10 text-accent-300" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={1.4}>
          <circle cx="9" cy="9" r="3" />
          <circle cx="16" cy="10" r="2.4" />
          <path d="M3.5 19c.6-3 2.8-4.7 5.5-4.7s4.9 1.7 5.5 4.7M14 14.6c2.3.1 4 1.6 4.6 4" strokeLinecap="round" />
        </svg>
      )}
    </div>
  );
}

# Design system

The public website uses one bright, soft, people-centered design system. Tokens live in
`src/app/globals.css` (`@theme`); components live in `src/components/`.

## Principles

- **Bright and soft only.** No navy, charcoal or black section backgrounds, and no dark overlays on photos.
- **Contrast through structure:** alternating section backgrounds, cards with borders and soft shadows, strong dark headings, the teal accent, and photography.
- **People first:** owner-supplied photographs are the main visual element on major pages; illustrations are fallbacks and explanatory diagrams.
- **Honest:** no invented people, numbers, testimonials or wealth imagery.

## Color

| Role | Token / class | Use |
| --- | --- | --- |
| Heading text | `ink-950`, `ink-900` | All headings |
| Body text | `ink-700` (min. `ink-600` on tinted backgrounds) | Paragraphs |
| Secondary text | `ink-600` | Captions, hints. Never lighter on tinted backgrounds |
| Primary accent | `accent-700` (hover `accent-800`) | Primary buttons (white text, AA contrast), links |
| Accent tints | `accent-50`–`accent-300` | Highlights, badges, icon tiles, borders |
| Pastel support | `sky`, `emerald`, `violet`, `amber`, `rose` at 100–300 | Icon tiles, diagram stages. Sparingly |
| Warnings | `amber-50`/`amber-200`/`amber-950` | "No guarantees" style notices |

## Backgrounds and section rhythm

`<Section tone>` and `<SplitSection tone>` accept:

| Tone | Class | Typical use |
| --- | --- | --- |
| `white` | `bg-white` | Main content |
| `gray` | `bg-ink-50` | Feature sections, forms, document panels |
| `blue` | `bg-sky-50` | Informational sections |
| `soft` | teal-to-sky gradient | Emphasis sections; the call-to-action band uses a similar soft gradient |

Neighbouring sections must never share the same tone. Typical home page order:
white hero → blue → white → gray → white → blue → white → gray → white → soft CTA → gray footer.

## Typography

- Font: Inter (self-hosted through `next/font`).
- H1: `text-4xl sm:text-5xl` (home hero up to `xl:text-6xl`), semibold, `ink-950`.
- H2: `text-3xl sm:text-4xl`, semibold.
- H3: `text-lg` (featured cards `text-2xl`), semibold.
- Body: `text-lg leading-8` for intros, `leading-7` in cards.
- Eyebrow: `text-sm font-semibold uppercase tracking-wider text-accent-700`.

## Components

| Component | File | Notes |
| --- | --- | --- |
| `Button`, `ButtonLink` | `components/ui/primitives.tsx` | Rounded pills. Variants: `primary`, `secondary`, `soft`, `ghost`, `danger` |
| `Card` | same | `rounded-2xl`, `border-ink-100`, `shadow-soft`, lifts on hover |
| `Section`, `SectionHeading` | same | Tones above; `py-16 sm:py-24` |
| `PageHeader` | same | Text plus optional `visual` (photo). `visualSize="sm"` for restrained pages (FAQ, Contact). `actions` for CTAs |
| `SplitSection` | `components/photos/layouts.tsx` | Image-and-text two columns; text first on mobile |
| `Photo` | `components/photos/photo.tsx` | All photographs. See below |
| `CtaBand` | `components/site/blocks.tsx` | Soft gradient, dark text, primary button |
| `ValueFlow`, `RevenueFlow` | `components/visuals/` | Explanatory diagrams |
| `WorldClock` | `components/visuals/world-clock.tsx` | Live local times |

## Photography

- Every photo is a slot in `src/content/photos.ts` (path, brief, alt text, aspect ratio, minimum width, focal point).
- `<Photo id="…" sizes="…" />` renders the image with `next/image`, cropped with `object-cover` to the slot's aspect ratio. `priority` is used only on page-header and hero images.
- Missing file: labelled placeholder in development; original illustration (via `fallback`) or a neutral panel in production. Never a broken image.
- Aspect ratios: hero and page headers 4:3; editorial and process images 3:2; category and contributor cards 4:3; portraits 4:5.
- Corners: `rounded-2xl` by default (`rounded-3xl` on the home hero); images inside cards use `rounded-none` so the card shape frames them.
- Images are local only (`public/images/people/…`). No remote image domains; the CSP keeps `img-src 'self' data: blob:`.
- Owner documents: `docs/PHOTO-SHOT-LIST.md`, `docs/IMAGE-CREDITS.md`. Status: `npm run photos:status`.

## Spacing and layout

- Container: `max-w-6xl`, side padding `px-4 sm:px-6 lg:px-8`.
- Section padding: `py-16 sm:py-24`; page headers `py-12 sm:py-16 lg:py-20`.
- Grids collapse to one column on phones; two-column layouts switch at `lg` (1024 px).
- Full navigation from `xl` (1280 px); compact menu below.

## Motion

Subtle only: scroll reveal, hover lift, the live-clock pulse, and the soft diagrams. All motion is disabled when `prefers-reduced-motion` is set.

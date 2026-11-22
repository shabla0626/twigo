# DESIGN REVISION MASTER PROMPT

**Professional Corporate Website Redesign: People-Centered Visual Identity (Bright & Soft Edition)**

---

## 1. YOUR ROLE

Act as a senior UI/UX designer, visual design director, brand identity specialist, and experienced frontend engineer.

Your task is to significantly improve the visual design and presentation of the existing CoWork website.

This is a visual redesign and refinement project, **not** a complete application rewrite.

### 1.1 Current state of the project (inspect it, do not assume)

The website already exists and works. It includes:

- Next.js 16 (App Router), React 19, TypeScript (strict), Tailwind CSS 4 (theme tokens defined with `@theme` in `src/app/globals.css`).
- PostgreSQL with Prisma 6 running in engine-free mode (`engineType = "client"` with the `@prisma/adapter-pg` driver adapter).
- Public pages: Home, About, How It Works, Participation, Compensation, Founding Contributors, FAQ, Contact, Apply, Privacy, Terms.
- A working application form, contact form, secure admin login and admin dashboard (applications, participants, projects, content editor, inquiries, audit log).
- Editable website text stored in the database (`SiteContent`) and edited from `/admin/content`, with defaults in `src/lib/content/defaults.ts`.
- A **bright and soft** visual style: white and pastel backgrounds (soft sky, mint, lilac, peach), a soft teal accent, rounded buttons and cards, soft shadows.
- Original, code-drawn SVG illustrations on every page (`src/components/visuals/`), a live world clock, an animated "how value flows" diagram, scroll-reveal and hover effects, all of which respect reduced-motion preferences.
- **No photographs yet.** There is no `public/images` folder.

Preserve all existing functionality, business logic, database structures, authentication, and application workflows unless a change is absolutely necessary for the visual improvements.

Your primary responsibility is to turn the website into a visually sophisticated, trustworthy, modern corporate platform that communicates the company's identity through professional layouts, clear visual contrast within a bright and soft palette, and authentic human photography supplied by the site owner.

---

## 2. CORE VISUAL IDENTITY

The company is built around a simple but meaningful philosophy:

> People from different economic circumstances, professional backgrounds, age groups, and skill levels can cooperate remotely, combine their abilities, perform meaningful work, generate actual business revenue, and receive fair compensation for their contributions.

The website must visually communicate:

- Cooperation among ordinary people.
- Equal opportunities to contribute.
- Professionalism and mutual respect.
- Remote collaboration.
- Different abilities working toward shared objectives.
- Economic opportunity through productive cooperation.
- Trust, responsibility, and transparency.

The visual identity must NOT resemble a generic recruitment website, investment platform, cryptocurrency project, or unrealistic get-rich-quick business.

We are building a professional collaborative business organization. Visitors should feel that they are looking at a legitimate, carefully organized, people-oriented company.

---

## 3. BACKGROUND COLORS AND VISUAL CONTRAST: BRIGHT AND SOFT ONLY

The website must stay **bright and soft** throughout. **Do not use deep navy, charcoal, black, or any other dark section backgrounds**, including for hero sections, call-to-action bands, or the footer.

However, a completely uniform white background across every page and section is also not acceptable. Every page must have clear visual structure and differentiated content areas, achieved within the bright palette.

### 3.1 Approved background palette

Use only colors from the existing design system (extend it in `globals.css` if needed; do not introduce unrelated colors):

- White.
- Very light gray (e.g. `ink-50`).
- Soft blue (e.g. `sky-50`, `accent-50`).
- Subtle warm neutrals.
- Soft pastel tints (mint, lilac, peach), used sparingly and only as gentle gradients or accents.
- The soft teal accent for buttons, links, highlights and emphasis.

Example section rhythm for a long page:

1. White hero with a soft gradient edge and a large photograph.
2. Soft blue informational section.
3. White content section.
4. Light gray feature section.
5. Soft teal-tinted call-to-action band (light background, dark text, strong teal button).
6. Light, clearly separated footer (soft blue or light gray with a top border).

Do not use random colors simply to make sections look different.

### 3.2 How to create contrast without dark sections

- Alternate section backgrounds (white, light gray, soft blue) so that neighbouring sections are always distinguishable.
- Use cards with subtle borders and soft shadows on tinted backgrounds.
- Use strong, dark heading text (`ink-900`/`ink-950`) and body text no lighter than `ink-600` on tinted backgrounds.
- Use the teal accent for primary buttons (accessible contrast, e.g. `accent-700` with white text) and key highlights.
- Use photographs as the main source of visual richness and depth.
- Use thin dividers, section borders and background transitions where appropriate.

### 3.3 Contrast requirements

- Text contrast must meet WCAG 2.2 AA (4.5:1 for normal text, 3:1 for large text and UI components).
- Headings must be visually prominent.
- Distinguish important information from secondary information.
- Avoid pale, low-contrast text, especially on tinted backgrounds and over photographs.
- Avoid large areas of monotonous white space without meaningful visual structure.

The overall result should feel bright, soft, and visually rich.

---

## 4. HUMAN PHOTOGRAPHY: OWNER-SUPPLIED, A MAJOR DESIGN PRIORITY

Human photography is one of the most important parts of this redesign. Photographs of people should become a central element of the visual identity on the major public pages.

### 4.1 Source of photographs: supplied by the site owner

- **The site owner will supply all photographs**: their own photos, or images they purchase or license themselves (for example from Adobe Stock or Shutterstock).
- **Do not download, hotlink, scrape, or embed any images from the internet yourself**, including Unsplash, Pexels, Google Images, or any other source.
- **Do not generate AI images.**
- Do not configure remote image domains in `next.config.ts`. All images are served locally from the project. The existing Content Security Policy (`img-src 'self' data: blob:`) must remain unchanged.

### 4.2 Build the photo system now, with placeholders

Because the photographs are not available yet, build the complete photo-ready layout system so the owner only needs to add files:

1. **Asset folder:** `public/images/people/` with one subfolder per page (`home/`, `about/`, `how-it-works/`, `participation/`, `compensation/`, `founding-contributors/`, `faq/`, `contact/`, `apply/`).
2. **Photo manifest:** a single typed file (e.g. `src/content/photos.ts`) listing every photo slot with:
   - `id` (e.g. `home-hero`), page, and section;
   - file path (descriptive filename, e.g. `/images/people/home/remote-team-video-call.jpg`);
   - a short description of the ideal subject (the brief for the owner);
   - aspect ratio and minimum pixel size;
   - descriptive `alt` text;
   - optional focal point (`object-position`) for responsive cropping;
   - `credit` and `license` fields for the owner to fill in;
   - an `available` flag (or automatic file detection at build time).
3. **Reusable `Photo` component** built on `next/image`:
   - correct `sizes` for each layout, `priority` only for the hero image, lazy loading elsewhere;
   - consistent aspect ratios with `object-fit: cover` and the focal point;
   - **when the file is missing:** show a tasteful, clearly labelled placeholder in development (soft panel with a camera icon and text such as "Photo placeholder: home-hero, diverse people collaborating remotely"). In production, fall back to the existing original illustration for that page or to a soft neutral panel. Never show a broken image, and never let the build fail because a photo is missing.
4. **Owner documentation:**
   - `docs/PHOTO-SHOT-LIST.md`: every slot with the subject brief, mood, composition notes, aspect ratio, minimum resolution (hero at least 2400 px wide; other images at least 1600 px wide), file format (JPG or WebP), target file size, and where it appears.
   - `docs/IMAGE-CREDITS.md`: a table the owner fills in for each photo (file, source, photographer/agency, licence type, licence reference, date acquired, commercial use confirmed).
   - A short "How to add a photo" section: put the file at the path in the manifest, fill in credit and licence, run the site, check the crop.

### 4.3 The people we want to represent (brief for the owner)

The shot list should ask for ordinary people from different walks of life, with different:

- Age groups.
- Professional and educational backgrounds.
- Levels of technical expertise.
- Economic circumstances.
- Cultural backgrounds.
- Working environments.

The mix should be realistic, not exclusively wealthy executives or highly polished corporate professionals. Include:

- Software developers and technical professionals.
- Data analysts and researchers.
- Administrative workers and customer support professionals.
- Independent remote workers.
- People learning new skills.
- General contributors.
- People collaborating on shared projects.

### 4.4 Photography style (brief for the owner)

Preferred:

- Natural facial expressions.
- Realistic working environments and modern home offices.
- People using laptops and computers.
- Small groups collaborating; individual remote workers.
- Realistic everyday or professional clothing.
- Natural lighting and clean composition.
- Bright, airy tones that suit the soft palette.
- Appropriate negative space for website text.

Avoid:

- People unnecessarily smiling at the camera.
- Artificial handshakes or overly staged executive meetings.
- Unrealistic luxury offices.
- Repetitive photographs of nearly identical people.
- Generic stock imagery that does not communicate the mission.
- Dark, moody, or heavily filtered images that clash with the bright palette.

### 4.5 Authenticity and representation

- Photographs are illustrative visual assets.
- Never present models or photographed people as actual employees, founders, participants, or project teams.
- Do not add names, job titles, quotes, testimonials, or success stories to photographs.
- Add an unobtrusive note in the footer, such as "Photographs are illustrative and do not depict members of the organization."
- The photographs represent the kinds of people the organization welcomes, not people who already belong to it.

### 4.6 Role of the existing illustrations

- Photography becomes the primary visual element on major pages.
- Keep the original illustrations as the production fallback for missing photos, and keep diagrams that explain something (the "how value flows" diagram, the compensation diagram, the live world clock).
- Remove or reduce purely decorative illustrations where a photograph takes their place, so pages do not feel cluttered.

---

## 5. PAGE-BY-PAGE VISUAL DESIGN REQUIREMENTS

Each major page must have its own visual composition while keeping one consistent corporate identity. Do not duplicate the same layout and only swap the text. Every photo below is a **slot in the photo manifest** with a placeholder until the owner supplies it.

Text that is already editable in `/admin/content` (company, hero, announcement, contact, FAQ, categories) must stay editable. Change its default wording in `src/lib/content/defaults.ts`, not by hard-coding it into pages.

### 5.1 Home page

Make a strong first impression with a large, bright hero:

- Strong headline: "Work Together. Create Value. Share the Results."
- Supporting message: "Bring your abilities together with others, collaborate remotely, and create meaningful opportunities through shared effort."
- Clear primary call-to-action (apply) and a secondary link (how it works).
- **Photo slot `home-hero`:** diverse people working remotely or collaborating on a project; communicates teamwork, accessibility and shared opportunity. On mobile, crop to keep faces and hands with laptops visible.

Below the hero, visually distinct sections with alternating bright backgrounds:

1. Our Mission (with a supporting photo slot).
2. The Power of Collaboration (keep the "how value flows" diagram).
3. Who Can Participate (a small photographic grid of different contributor types, each a separate slot).
4. How We Work Together.
5. Fair Contribution-Based Compensation.
6. Founding Contributor Opportunities (photo slot).
7. Final recruitment call-to-action (soft teal-tinted band, not dark).

Keep the live world clock section, styled in the bright palette.

### 5.2 About us

- Editorial layout, not a conventional corporate history page.
- **Photo slot:** people from different professional backgrounds working together.
- Visually distinct sections: Why We Exist, Our Philosophy, The Value of Cooperation, Our Long-Term Vision.
- Present the organization honestly as an initiative in its founding stage, with one founder and no established team yet. Do not invent a company history.

### 5.3 How it works

- Explain the 10-step process visually with numbered cards, subtle background changes and photographs.
- **Photo slots:** a person working individually from home; a remote project discussion; online research and computer work; people collaborating through digital tools.
- The page should be understandable without reading excessive text.
- Keep the notice that applying does not guarantee acceptance, project assignment or income.

### 5.4 Participation opportunities

This page is particularly important because the company welcomes people with different capabilities.

- One card or section with its own **photo slot** for each category: Technology & Software Development; AI & Data Operations; Research & Analysis; Marketing & Business Development; Customer Support; Administration & Operations; General Remote Work.
- Categories are editable in the admin content editor. Map photos to categories so that an edited or added category still renders correctly (falling back to an illustration or icon).
- Do not present all participants as highly specialized technical professionals. Show that general work capabilities and willingness to learn are valued.
- Keep the "Current opportunities" area, which shows only confirmed, admin-published projects.

### 5.5 Compensation and transparency

- Restrained, professional style.
- **Photo slot:** people cooperating on ordinary business activities.
- A clear diagram explaining the flow: actual customer revenue → project expenses → agreed compensation arrangements → individual contributions → fair distribution according to the written agreement.
- Do not show percentages, sample earnings, income calculators, money, luxury lifestyles, expensive cars, or financial-success imagery.
- The message is productive cooperation and fair compensation, not wealth.

### 5.6 Founding contributors

This page is especially important for initial recruitment.

- Welcoming, sincere and professional.
- **Photo slots:** diverse individuals working remotely (a small, varied set, not identical-looking people).
- Emphasize: remote participation; flexible availability; different professional backgrounds; opportunities for general contributors; responsibility and commitment; shared business development; no membership fees or capital contributions.
- Make the application call-to-action highly visible.
- Do not imply that the company already has a large or established workforce.

### 5.7 FAQ

- Clean, readable, visually organized.
- At most one small supporting **photo slot** in the introduction.
- Prioritize readability over decoration.

### 5.8 Contact

- Professional, welcoming layout.
- **Photo slot:** an individual working remotely or communicating online.
- Keep the contact form simple, accessible and unchanged in behaviour.

### 5.9 Application page

- Prioritize clarity, usability and trust.
- A restrained photographic header or one small supporting **photo slot**.
- Photos and decoration must not distract from the form.
- The form must remain easy to complete on mobile.
- Do not change form fields, validation, spam protection or submission logic.

### 5.10 Privacy policy and terms

- Readable, professional document presentation.
- No large photographs.
- Clear typography, spacing and section hierarchy.
- Keep the existing "draft, requires legal review" notices and bracketed placeholders.

---

## 6. CONSISTENT CORPORATE DESIGN SYSTEM

Extend the existing design system rather than replacing it. Document it in `docs/DESIGN-SYSTEM.md`.

Define:

- Primary, secondary and accent colors (bright and soft palette only; no dark section colors).
- Background colors and the approved section rhythm.
- Typography, heading hierarchy and body text styles.
- Button styles (primary teal, secondary white with border, soft).
- Card styles, border styles and shadow levels.
- Section spacing scale.
- Image aspect ratios (suggested: hero 3:2 on desktop and 4:5 on mobile; editorial 3:2; category cards 4:3; portraits 4:5).
- Image corner radius: moderate and consistent. Avoid rounding every image heavily.
- Responsive layout rules and breakpoints.

Use a consistent header and footer. Create reusable section layouts (e.g. `SplitSection` for image and text, `PhotoGrid`, `PhotoHero`) and photographic components. Avoid making every page visually identical.

---

## 7. PHOTOGRAPHIC LAYOUT AND IMAGE QUALITY

Use photographs intentionally:

- Large hero photography.
- Two-column image-and-text sections.
- Editorial photographic blocks.
- Image cards.
- Carefully arranged photographic grids.
- Background photographs only with a **light** overlay (e.g. a white or soft gradient) where text must remain readable. No dark overlays.

Maintain consistent image quality and aspect ratios. Use `object-fit` and focal points for responsive cropping.

Avoid:

- Distorted faces or awkward cropping.
- The same photograph repeated across unrelated sections.
- Excessively rounded image cards everywhere.
- Low-resolution images.
- Photographs unrelated to the surrounding content.

Placeholders must use the same size, aspect ratio and position as the final photo, so the layout does not change when photos are added.

---

## 8. RESPONSIVE DESIGN

The redesigned website must work on large desktop monitors, standard desktops, laptops, tablets, and mobile phones.

Pay particular attention to:

- Mobile hero image composition and cropping.
- Text readability.
- Navigation (the current header shows the full menu on wide screens and a compact menu below that).
- Card stacking and section spacing.
- Application forms.
- Call-to-action visibility.

Avoid horizontal scrolling. Photographs must remain meaningful at small sizes.

---

## 9. ACCESSIBILITY AND PERFORMANCE

- WCAG 2.2 AA principles where practical.
- Sufficient text contrast, semantic HTML, accessible navigation.
- Descriptive `alt` text for meaningful photos (from the manifest); empty `alt` for purely decorative ones.
- Responsive images via `next/image`, appropriate compression, lazy loading for non-critical images, and `priority` loading for the hero image only.
- No unnecessary animation. Keep the existing subtle motion, but reduce decorative animation where photos now carry the page.
- Continue to respect `prefers-reduced-motion`.
- Do not sacrifice performance for decoration.

---

## 10. IMPLEMENTATION REQUIREMENTS

Before making changes:

1. Inspect the existing website and review every public page.
2. Identify existing design components (`src/components/ui`, `src/components/site`, `src/components/visuals`, `src/components/forms`).
3. Review the Tailwind theme in `src/app/globals.css`.
4. Confirm there are no existing image assets.
5. Identify repeated or inconsistent visual patterns.

Then prepare a concise page-by-page redesign plan and implement it directly in the project.

### 10.1 Preserve

- Next.js architecture and TypeScript implementation.
- PostgreSQL database and Prisma schema (keep `engineType = "client"`; do not re-add Prisma `previewFeatures` or the native query engine).
- Authentication and the admin dashboard.
- Application submission, server actions, validation, spam protection and security controls (including the Content Security Policy and security headers).
- Admin-editable site content.
- Existing business logic and automated tests.

Do not rewrite the backend to achieve a visual redesign.

### 10.2 Local environment notes (Windows)

- Start the local database with `npm run db:up` (keep it running) and the site with `npm run dev` (uses webpack).
- Stop the dev server before running `npm run build`; both use the `.next` folder.
- Stop the local database before running `npm ci` or `npm install`; its files in `node_modules` are locked while it runs.

---

## 11. QUALITY CONTROL

After implementing the redesign, inspect **every** public page individually. A successful home page does not mean the whole site is complete.

Verify:

1. Every major page has a visually differentiated layout.
2. The site is bright and soft throughout, with no dark or navy sections, yet neighbouring sections are clearly distinguishable.
3. Text remains readable (AA contrast) on every background and over every photograph.
4. Every planned photo slot renders correctly in both states:
   - **without a file:** labelled placeholder in development, illustration or neutral fallback in production, never a broken image;
   - **with a file:** test with a temporary locally generated test image (not from the internet), check cropping on desktop and mobile, then remove the test image.
5. The photo manifest, shot list and image-credits documents are complete and consistent with each other.
6. No photo slot is reused for unrelated sections.
7. Nothing presents photographed people as real company personnel, and the footer includes the illustrative-photos note.
8. The design works on desktop, tablet and mobile with no horizontal scrolling.
9. The application form and contact form still submit successfully.
10. Admin login, the dashboard and the content editor still work, and edited content still appears on the public pages.
11. No security or privacy protections have been weakened (CSP unchanged, no remote image domains).

Run:

- `npm run typecheck`
- `npm run lint`
- `npm run build` (with the dev server stopped)
- `npm test` (with the local database running)

Fix visual and functional regressions before declaring completion.

---

## 12. FINAL DESIGN OBJECTIVE

The final website should communicate a very specific message:

> This is a professional remote collaborative business organization that welcomes ordinary people with different abilities and backgrounds. It believes that people can create better economic opportunities by combining their individual capabilities, taking responsibility, cooperating effectively, and generating actual business value.

The website should not visually celebrate wealth or corporate status. It should represent people, meaningful work, cooperation, and shared opportunity.

The visual identity should be **bright, soft, modern, professional, welcoming, and trustworthy**.

The people are the center of this organization. Make that immediately visible throughout the website. Once the owner adds the photographs, the site should look finished without further code changes.

Begin by inspecting the existing website and preparing a page-by-page redesign plan. Then implement the improvements directly in the existing project. Do not stop at recommendations or static mockups: complete the frontend redesign, including the photo system, placeholders and owner documentation, and verify the results in the browser.

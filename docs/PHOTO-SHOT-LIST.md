# Photo shot list

Every photograph on the public website, grouped by page. The site owner supplies
these photos (own photos, or images licensed from a source such as Adobe Stock or
Shutterstock). Nobody else downloads images from the internet for this site.

Generated from `src/content/photos.ts` (the photo manifest). If you change a slot
there, update this file too; `npm test` checks that every slot is listed here.

## General guidance

**Show ordinary people from different walks of life:** different ages, backgrounds,
cultures, levels of technical expertise and working environments. Not only polished
executives.

**Preferred style**
- Natural expressions; people focused on their work rather than smiling at the camera.
- Realistic home offices and modest workspaces; laptops and computers.
- Small groups collaborating, or individuals working remotely.
- Natural light; bright, airy tones that suit the site's soft palette.
- Space around the subject so the image crops well on phones.

**Avoid**
- Staged handshakes, executive boardrooms, luxury offices.
- Money, expensive cars or wealth imagery.
- Dark, moody or heavily filtered images.
- Several photos of nearly identical-looking people.

**Honesty:** photos are illustrative. They are never presented as staff, founders or
participants. The footer automatically shows "Photographs are illustrative and do not
depict members of the organization" once any photo is added.

**File requirements**
- Format: JPG (or WebP). Save with the exact filename and folder given below.
- Size: at least the minimum width listed; hero images 2400 px wide or more.
- File size: aim for under 600 KB (hero under 900 KB). The site creates smaller versions automatically.
- Aspect ratio: as listed. Slightly different photos are cropped to fit; keep faces away from the edges.

## How to add a photo

1. Save the file at the path shown (inside the project's `public` folder).
2. Record its source and licence in `docs/IMAGE-CREDITS.md`.
3. Run `npm run photos:status` to confirm it is detected.
4. Restart `npm run dev` (or rebuild for production) and check the page on desktop and phone.
5. If faces are cropped badly, set `focal` for that slot in `src/content/photos.ts` (e.g. `"50% 30%"`).

## Home

| Slot | Section | What the photo should show | Ratio | Min width | Save as |
| --- | --- | --- | --- | --- | --- |
| `home-hero` | Hero | Two or three people of different ages and backgrounds collaborating remotely: for example one person at a home desk on a video call with others visible on the laptop screen. Bright natural light, realistic home setting, space on one side for breathing room. | 4:3 | 2400px | `public/images/people/home/hero-remote-collaboration.jpg` |
| `home-mission` | Our Mission | A small, mixed group of ordinary people working together with laptops and notes, informal and realistic, not an executive meeting. | 4:5 | 1600px | `public/images/people/home/mission-small-team-working.jpg` |
| `home-who-professional` | Who Can Participate: professionals | A software developer or data analyst concentrating on code or a chart at a laptop, at home or in a modest workspace. | 4:3 | 1600px | `public/images/people/home/who-technical-professional.jpg` |
| `home-who-general` | Who Can Participate: general contributors | A person doing careful everyday operational work: organizing documents, entering data in a spreadsheet or checking information. | 4:3 | 1600px | `public/images/people/home/who-general-contributor.jpg` |
| `home-who-learning` | Who Can Participate: developing contributors | An adult (any age, ideally not only young people) learning a new skill online: following a course and taking notes. | 4:3 | 1600px | `public/images/people/home/who-learning-new-skills.jpg` |
| `home-founding` | Founding Contributor Opportunities | An individual remote worker in a modest, tidy home workspace, focused on their work. Natural, not posed toward the camera. | 4:3 | 1600px | `public/images/people/home/founding-remote-worker.jpg` |

## About

| Slot | Section | What the photo should show | Ratio | Min width | Save as |
| --- | --- | --- | --- | --- | --- |
| `about-header` | Header | People from clearly different professional backgrounds and age groups working together on one task. Editorial feel, natural light. | 4:3 | 1800px | `public/images/people/about/header-different-backgrounds.jpg` |
| `about-cooperation` | The Value of Cooperation | Two people with different skill levels working side by side, one explaining something to the other on a laptop. | 3:2 | 1600px | `public/images/people/about/cooperation-side-by-side.jpg` |

## How It Works

| Slot | Section | What the photo should show | Ratio | Min width | Save as |
| --- | --- | --- | --- | --- | --- |
| `how-header` | Header | A person working individually from home, for example at a kitchen table or small desk with a laptop. | 4:3 | 1800px | `public/images/people/how-it-works/header-working-from-home.jpg` |
| `how-discussion` | Phase 2: match and agree | A remote project discussion: a laptop screen showing a video call with several participants, seen from behind or beside the person. | 3:2 | 1600px | `public/images/people/how-it-works/remote-discussion.jpg` |
| `how-research` | Phase 1: apply and get to know each other | A person doing online research and computer work: browser open, notes beside the laptop. | 3:2 | 1600px | `public/images/people/how-it-works/online-research.jpg` |
| `how-collaboration` | Phase 3: work, deliver and settle | People collaborating through digital tools: a shared document, task board or design file being worked on together. | 3:2 | 1600px | `public/images/people/how-it-works/digital-collaboration.jpg` |

## Participation

| Slot | Section | What the photo should show | Ratio | Min width | Save as |
| --- | --- | --- | --- | --- | --- |
| `participation-header` | Header | A varied group of people (different ages, backgrounds and roles) each working in their own way, or one image that shows that variety. | 4:3 | 1800px | `public/images/people/participation/header-varied-contributors.jpg` |
| `participation-technology` | Category: Technology & Software Development | A developer writing or reviewing code; screen visible but not the main focus. | 4:3 | 1200px | `public/images/people/participation/technology-software-development.jpg` |
| `participation-ai-data` | Category: AI & Data Operations | A person labeling or reviewing data, or working with charts and spreadsheets. | 4:3 | 1200px | `public/images/people/participation/ai-data-operations.jpg` |
| `participation-research` | Category: Research & Analysis | A person researching with printed or on-screen sources, making notes. | 4:3 | 1200px | `public/images/people/participation/research-analysis.jpg` |
| `participation-marketing` | Category: Marketing & Business Development | A person writing content, planning outreach or sketching ideas for a customer. | 4:3 | 1200px | `public/images/people/participation/marketing-business-development.jpg` |
| `participation-support` | Category: Customer Support | A customer support worker with a headset or answering messages, friendly and attentive. | 4:3 | 1200px | `public/images/people/participation/customer-support.jpg` |
| `participation-admin` | Category: Administration & Operations | A person organizing schedules, documents or project records. | 4:3 | 1200px | `public/images/people/participation/administration-operations.jpg` |
| `participation-general` | Category: General Remote Work | An ordinary person doing careful general computer work at home: data entry, checking information. Shows that no specialist background is needed. | 4:3 | 1200px | `public/images/people/participation/general-remote-work.jpg` |

## Compensation

| Slot | Section | What the photo should show | Ratio | Min width | Save as |
| --- | --- | --- | --- | --- | --- |
| `compensation-header` | Header | Two or three people cooperating on ordinary business activities, such as reviewing a plan or document together. No money, no luxury. | 4:3 | 1800px | `public/images/people/compensation/header-reviewing-plan.jpg` |

## Founding Contributors

| Slot | Section | What the photo should show | Ratio | Min width | Save as |
| --- | --- | --- | --- | --- | --- |
| `founding-header` | Header | A welcoming, sincere image of a person working remotely: focused, comfortable, ordinary home setting. | 4:3 | 1800px | `public/images/people/founding-contributors/header-remote-contributor.jpg` |
| `founding-person-1` | Who we are looking for (portrait 1) | An individual remote worker. Choose the three portraits to differ in age, background and setting. | 4:5 | 1000px | `public/images/people/founding-contributors/portrait-remote-worker-1.jpg` |
| `founding-person-2` | Who we are looking for (portrait 2) | A second, clearly different individual working remotely (different age group or background from portrait 1). | 4:5 | 1000px | `public/images/people/founding-contributors/portrait-remote-worker-2.jpg` |
| `founding-person-3` | Who we are looking for (portrait 3) | A third individual working remotely, again different from portraits 1 and 2. | 4:5 | 1000px | `public/images/people/founding-contributors/portrait-remote-worker-3.jpg` |

## FAQ

| Slot | Section | What the photo should show | Ratio | Min width | Save as |
| --- | --- | --- | --- | --- | --- |
| `faq-header` | Header | A calm image of a person reading information on a laptop or tablet. | 4:3 | 1200px | `public/images/people/faq/header-reading.jpg` |

## Contact

| Slot | Section | What the photo should show | Ratio | Min width | Save as |
| --- | --- | --- | --- | --- | --- |
| `contact-header` | Header | A person communicating online: typing a message or speaking on a video call with a headset. | 4:3 | 1200px | `public/images/people/contact/header-online-communication.jpg` |

## Apply

| Slot | Section | What the photo should show | Ratio | Min width | Save as |
| --- | --- | --- | --- | --- | --- |
| `apply-header` | Sidebar | A person calmly filling in an online form on a laptop or phone at home. | 4:3 | 1200px | `public/images/people/apply/header-completing-form.jpg` |


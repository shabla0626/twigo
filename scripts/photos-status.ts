/**
 * Lists every photo slot and whether its file has been added.
 *
 *   npm run photos:status
 */
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { PHOTOS, type PhotoSlot } from "../src/content/photos";

const rows = Object.entries(PHOTOS as Record<string, PhotoSlot>).map(([id, slot]) => {
  const file = path.join(process.cwd(), "public", slot.src);
  const present = existsSync(file);
  const sizeKb = present ? Math.round(statSync(file).size / 1024) : 0;
  return { id, page: slot.page, status: present ? `added (${sizeKb} KB)` : "missing", file: `public${slot.src}` };
});

const added = rows.filter((r) => r.status !== "missing").length;
console.table(rows);
console.log(`${added} of ${rows.length} photos added.`);
if (added < rows.length) {
  console.log("Missing photos show a labelled placeholder in development and an illustration on the live site.");
  console.log("See docs/PHOTO-SHOT-LIST.md for what each photo should show.");
}

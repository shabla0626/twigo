"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/guard";
import { audit } from "@/lib/audit";
import { resetContent, saveContent } from "@/lib/content";
import { contentSchemas, type ContentKey } from "@/lib/content/schema";
import { db } from "@/lib/db";
import { formToObject, inquiryStatusSchema } from "@/lib/validation/admin";

function rows(fd: FormData, prefix: string, fields: string[]) {
  const out: Record<string, string>[] = [];
  for (let i = 0; i < 100; i++) {
    if (!fd.has(`${prefix}.${i}.${fields[0]}`)) break;
    const row: Record<string, string> = {};
    for (const f of fields) row[f] = String(fd.get(`${prefix}.${i}.${f}`) ?? "").trim();
    if (fields.some((f) => row[f])) out.push(row);
  }
  return out;
}

function valueFor(key: ContentKey, fd: FormData): unknown {
  const o = formToObject(fd);
  switch (key) {
    case "company":
      return { name: o.name, tagline: o.tagline, mission: o.mission };
    case "hero":
      return { eyebrow: o.eyebrow, headline: o.headline, subheadline: o.subheadline };
    case "announcement":
      return { enabled: o.enabled === "on", title: o.title, body: o.body };
    case "contact":
      return { email: o.email, responseNote: o.responseNote };
    case "faq":
      return { items: rows(fd, "items", ["q", "a"]) };
    case "categories":
      return { items: rows(fd, "items", ["title", "description", "examples"]) };
  }
}

export async function saveContentAction(fd: FormData) {
  const admin = await requireAdmin("content.edit");
  const key = String(fd.get("key")) as ContentKey;
  if (!(key in contentSchemas)) throw new Error("Unknown content key");
  const parsed = contentSchemas[key].safeParse(valueFor(key, fd));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const msg = `${issue?.path.join(".") || key}: ${issue?.message ?? "invalid"}`;
    redirect(`/admin/content?section=${key}&error=${encodeURIComponent(msg)}`);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await saveContent(key, parsed.data as any, admin.id);
  await audit(admin.id, "content.updated", "SiteContent", key);
  revalidatePath("/", "layout");
  redirect(`/admin/content?section=${key}&ok=saved`);
}

export async function resetContentAction(fd: FormData) {
  const admin = await requireAdmin("content.edit");
  const key = String(fd.get("key")) as ContentKey;
  if (!(key in contentSchemas)) throw new Error("Unknown content key");
  await resetContent(key);
  await audit(admin.id, "content.reset", "SiteContent", key);
  revalidatePath("/", "layout");
  redirect(`/admin/content?section=${key}&ok=reset`);
}

export async function inquiryStatusAction(fd: FormData) {
  const admin = await requireAdmin("inquiries.manage");
  const { id, status } = inquiryStatusSchema.parse(formToObject(fd));
  await db.contactInquiry.update({ where: { id }, data: { status } });
  await audit(admin.id, "inquiry.status_changed", "ContactInquiry", id, { status });
  revalidatePath("/admin/inquiries");
}

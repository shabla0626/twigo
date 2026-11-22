import { z } from "zod";
import { INQUIRY_CATEGORIES, keysOf } from "../labels";

export const contactSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(120),
  email: z.string().trim().toLowerCase().email("Please enter a valid email address.").max(200),
  category: z.enum(keysOf(INQUIRY_CATEGORIES), { message: "Please choose a category." }),
  subject: z.string().trim().min(1, "Subject is required.").max(160),
  message: z.string().trim().min(10, "Please write at least 10 characters.").max(4000),
  organization: z.string().trim().max(160).optional().transform((v) => v || undefined),
  timeline: z.string().trim().max(160).optional().transform((v) => v || undefined),
  website: z.string().max(500).optional(),
  formToken: z.string().min(1),
});

export type ContactData = z.output<typeof contactSchema>;

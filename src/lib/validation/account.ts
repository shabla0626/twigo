import { z } from "zod";
import { emailField } from "./email";

/** Sign-up form. Only what is needed to create a login; nothing professional or financial. */
export const registerSchema = z
  .object({
    fullName: z.string().trim().min(2, "Please enter your full name.").max(120, "Please use 120 characters or fewer."),
    email: emailField(),
    password: z.string().min(1, "Please choose a password.").max(200),
    confirm: z.string().max(200),
    // Three separate statements: two acceptances (contract terms) and one acknowledgment (privacy notice).
    acceptTerms: z.boolean().refine((v) => v === true, { message: "Please accept the Terms of Use to continue." }),
    acceptGuidelines: z.boolean().refine((v) => v === true, { message: "Please accept the Community Guidelines to continue." }),
    ackPrivacy: z.boolean().refine((v) => v === true, { message: "Please confirm that you have read the Privacy Policy." }),
    /** The ids of the document versions shown on the form (recorded exactly). */
    legalVersions: z.array(z.string().min(1).max(40)).max(10).default([]),
  })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "The two passwords do not match." });

export const emailOnlySchema = z.object({ email: emailField() });

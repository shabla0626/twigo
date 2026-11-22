import { z } from "zod";
import { emailField } from "./email";

/** Sign-up form. Only what is needed to create a login; nothing professional or financial. */
export const registerSchema = z
  .object({
    fullName: z.string().trim().min(2, "Please enter your full name.").max(120, "Please use 120 characters or fewer."),
    email: emailField(),
    password: z.string().min(1, "Please choose a password.").max(200),
    confirm: z.string().max(200),
    agree: z.boolean().refine((v) => v === true, { message: "Please agree to the Terms of Use and Privacy Notice to continue." }),
  })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "The two passwords do not match." });

export const emailOnlySchema = z.object({ email: emailField() });

// Email templates: plain text only, with {{placeholders}}.
// Defaults live here; administrators can override subject and body for each
// key at /admin/email (stored in the EmailTemplate table).
//
// Rules for all wording: never promise acceptance, project assignment or
// income; never ask for fees, payments, banking or identity documents.

export type EmailMessage = { to: string; subject: string; text: string };

export type TemplateKey =
  | "account_verification"
  | "account_exists"
  | "application_received"
  | "interview_invitation"
  | "application_waitlisted"
  | "application_declined"
  | "application_accepted"
  | "account_invitation"
  | "create_account_request"
  | "membership_status"
  | "email_verification"
  | "password_reset"
  | "community_notification"
  | "admin_new_application"
  | "admin_new_inquiry";

export type TemplateDef = {
  label: string;
  description: string;
  /** Who it goes to; "admin" templates contain no applicant personal data. */
  audience: "applicant" | "member" | "admin";
  /** Sent automatically by the system (vs. only by an administrator, after preview). */
  automatic: boolean;
  variables: string[];
  subject: string;
  body: string;
};

const FEES =
  "As a reminder: we never ask for membership fees, joining fees, deposits or investments. If you receive any such request claiming to be from us, please do not pay and let us know.";

export const TEMPLATES: Record<TemplateKey, TemplateDef> = {
  account_verification: {
    label: "Welcome: confirm your email",
    description: "Sent automatically when someone creates an account (and when they ask for it again). Contains a single-use link.",
    audience: "member",
    automatic: true,
    variables: ["name", "orgName", "verifyLink", "expiresIn"],
    subject: "{{orgName}}: confirm your email address",
    body: [
      "Hello {{name}},",
      "",
      "Welcome to {{orgName}}. Please confirm your email address to continue:",
      "",
      "{{verifyLink}}",
      "",
      "After confirming, you can fill in your membership application. Creating an account is free.",
      "",
      "The link works once and expires in {{expiresIn}}. If you did not create an account, you can ignore this email.",
      "",
      "— {{orgName}}",
    ].join("\n"),
  },
  account_exists: {
    label: "Account already exists",
    description: "Sent automatically when someone tries to create an account with an address that already has one.",
    audience: "member",
    automatic: true,
    variables: ["name", "orgName", "signInLink", "resetLink"],
    subject: "{{orgName}}: you already have an account",
    body: [
      "Hello {{name}},",
      "",
      "Someone (probably you) tried to create a new {{orgName}} account with this email address. You already have an account, so no new account was created.",
      "",
      "Sign in here: {{signInLink}}",
      "Forgot your password? Choose a new one here: {{resetLink}}",
      "",
      "If this was not you, you can ignore this email. Your account is unchanged.",
      "",
      "— {{orgName}}",
    ].join("\n"),
  },
  application_received: {
    label: "Application received",
    description: "Confirmation sent automatically after an application is submitted (if enabled).",
    audience: "applicant",
    automatic: true,
    variables: ["name", "orgName", "statusLink"],
    subject: "{{orgName}}: we received your application",
    body: [
      "Hello {{name}},",
      "",
      "Thank you for applying to join {{orgName}} as a founding contributor.",
      "",
      "This email confirms that we received your application. It does not mean that your application has been accepted, and it does not guarantee project assignment or compensation.",
      "",
      "Every application is reviewed by a person. You can sign in at any time to see the status of your application: {{statusLink}}",
      "",
      FEES,
      "",
      "— {{orgName}}",
    ].join("\n"),
  },
  interview_invitation: {
    label: "Interview invitation",
    description: "Invite an applicant to a short conversation. Add the proposed times in the details field.",
    audience: "applicant",
    automatic: false,
    variables: ["name", "orgName", "details", "contactEmail", "statusLink"],
    subject: "{{orgName}}: could we schedule a short conversation?",
    body: [
      "Hello {{name}},",
      "",
      "Thank you for your application to {{orgName}}. We would like to schedule a short, informal video or phone conversation to learn more about you and answer your questions.",
      "",
      "{{details}}",
      "",
      "This conversation is not a job interview and does not mean that you have been accepted. There is no cost of any kind.",
      "",
      "Reply to this email (or write to {{contactEmail}}) with a time that works for you. The details are also on your application status page: {{statusLink}}",
      "",
      "— {{orgName}}",
    ].join("\n"),
  },
  application_waitlisted: {
    label: "Application waitlisted",
    description: "Let an applicant know their application is on hold for now.",
    audience: "applicant",
    automatic: false,
    variables: ["name", "orgName", "details", "statusLink"],
    subject: "{{orgName}}: an update on your application",
    body: [
      "Hello {{name}},",
      "",
      "Thank you for your interest in {{orgName}}. We have reviewed your application and placed it on our waiting list for now. This usually means that we do not yet have enough collaborative activity matching your skills or availability.",
      "",
      "{{details}}",
      "",
      "We will contact you if this changes. You do not need to do anything in the meantime. Your status page: {{statusLink}}",
      "",
      "— {{orgName}}",
    ].join("\n"),
  },
  application_declined: {
    label: "Application declined",
    description: "A respectful decline.",
    audience: "applicant",
    automatic: false,
    variables: ["name", "orgName", "details", "statusLink"],
    subject: "{{orgName}}: your application",
    body: [
      "Hello {{name}},",
      "",
      "Thank you for taking the time to apply to {{orgName}}. After careful review, we are not able to offer you a place at this stage.",
      "",
      "{{details}}",
      "",
      "This decision reflects our current, very early needs and is not a judgment of your abilities. We wish you all the best.",
      "",
      "— {{orgName}}",
    ].join("\n"),
  },
  application_accepted: {
    label: "Application accepted",
    description: "Tell an applicant they were accepted. Sent with “Approve and notify” (membership is granted by the approval itself).",
    audience: "applicant",
    automatic: false,
    variables: ["name", "orgName", "details", "communityLink"],
    subject: "{{orgName}}: welcome, your application was accepted",
    body: [
      "Hello {{name}},",
      "",
      "We are glad to tell you that your application to {{orgName}} has been accepted.",
      "",
      "{{details}}",
      "",
      "You can now sign in with your email address and password, and enter the member community: {{communityLink}}",
      "",
      "Inside the community you can propose business ideas, discuss and support ideas from other members, and join research groups.",
      "",
      "Please keep in mind: acceptance does not guarantee paid project work or income. Any paid work is agreed in writing, with clear terms, before it starts.",
      "",
      FEES,
      "",
      "— {{orgName}}",
    ].join("\n"),
  },
  account_invitation: {
    label: "Account activation invitation",
    description: "Contains a single-use activation link. Sent by an administrator after acceptance.",
    audience: "member",
    automatic: false,
    variables: ["name", "orgName", "activationLink", "expiresIn"],
    subject: "{{orgName}}: activate your member account",
    body: [
      "Hello {{name}},",
      "",
      "Your {{orgName}} member account is ready. Use this secure link to confirm your email address and choose your password:",
      "",
      "{{activationLink}}",
      "",
      "The link works once and expires in {{expiresIn}}. If it has expired, reply to this email and we will send a new one.",
      "",
      "If you did not apply to {{orgName}}, you can ignore this email.",
      "",
      "— {{orgName}}",
    ].join("\n"),
  },
  create_account_request: {
    label: "Please create your account",
    description: "For applicants from before accounts existed: asks them to create an account with the same email address.",
    audience: "applicant",
    automatic: false,
    variables: ["name", "orgName", "joinLink"],
    subject: "{{orgName}}: please create your account",
    body: [
      "Hello {{name}},",
      "",
      "{{orgName}} now uses personal accounts. To continue with your application, please create your free account using this same email address:",
      "",
      "{{joinLink}}",
      "",
      "After you confirm your email address, your existing application is connected to your account automatically, and you can check its status at any time.",
      "",
      "— {{orgName}}",
    ].join("\n"),
  },
  membership_status: {
    label: "Membership status changed",
    description: "Sent when an administrator suspends, removes or restores someone's access to the member community.",
    audience: "member",
    automatic: true,
    variables: ["name", "orgName", "change", "contactEmail"],
    subject: "{{orgName}}: your community access",
    body: [
      "Hello {{name}},",
      "",
      "{{change}}",
      "",
      "Your account itself still exists, and you can sign in to see its status. If you have questions, write to {{contactEmail}}.",
      "",
      "— {{orgName}}",
    ].join("\n"),
  },
  email_verification: {
    label: "Email address verification",
    description: "Sent when a member changes their email address.",
    audience: "member",
    automatic: true,
    variables: ["name", "orgName", "verifyLink", "expiresIn"],
    subject: "{{orgName}}: confirm your new email address",
    body: [
      "Hello {{name}},",
      "",
      "Please confirm this email address for your {{orgName}} account:",
      "",
      "{{verifyLink}}",
      "",
      "The link expires in {{expiresIn}}. If you did not request this change, ignore this email; your account is unchanged.",
      "",
      "— {{orgName}}",
    ].join("\n"),
  },
  password_reset: {
    label: "Password reset",
    description: "Sent when someone requests a password reset for an existing account.",
    audience: "member",
    automatic: true,
    variables: ["name", "orgName", "resetLink", "expiresIn"],
    subject: "{{orgName}}: reset your password",
    body: [
      "Hello {{name}},",
      "",
      "We received a request to reset the password for your {{orgName}} account. Use this link to choose a new password:",
      "",
      "{{resetLink}}",
      "",
      "The link works once and expires in {{expiresIn}}. If you did not request this, ignore this email; your password stays the same.",
      "",
      "— {{orgName}}",
    ].join("\n"),
  },
  community_notification: {
    label: "Community notification",
    description: "Email copy of an important in-app notification (only for members who enabled email for that type).",
    audience: "member",
    automatic: true,
    variables: ["name", "orgName", "title", "body", "link"],
    subject: "{{orgName}}: {{title}}",
    body: [
      "Hello {{name}},",
      "",
      "{{title}}",
      "",
      "{{body}}",
      "",
      "Open it in the member community: {{link}}",
      "",
      "You can change which emails you receive in your notification settings.",
      "",
      "— {{orgName}}",
    ].join("\n"),
  },
  admin_new_application: {
    label: "Admin: new application",
    description: "Internal notice to the admin address. Contains no applicant personal data.",
    audience: "admin",
    automatic: true,
    variables: ["orgName", "adminUrl", "experience", "categories"],
    subject: "[{{orgName}}] New founding contributor application",
    body: ["A new application has been submitted.", "", "Experience level: {{experience}}", "Interested in: {{categories}}", "", "Review it in the dashboard: {{adminUrl}}"].join("\n"),
  },
  admin_new_inquiry: {
    label: "Admin: new inquiry",
    description: "Internal notice to the admin address when the contact or work-with-us form is used.",
    audience: "admin",
    automatic: true,
    variables: ["orgName", "adminUrl", "category"],
    subject: "[{{orgName}}] New contact inquiry ({{category}})",
    body: ["A new contact inquiry was submitted.", "", "View it in the dashboard: {{adminUrl}}"].join("\n"),
  },
};

export const TEMPLATE_KEYS = Object.keys(TEMPLATES) as TemplateKey[];

export function isTemplateKey(v: string): v is TemplateKey {
  return v in TEMPLATES;
}

/** Replaces {{name}} placeholders. Missing values become empty; blank lines from empty values collapse. */
export function renderTemplate(text: string, vars: Record<string, string | undefined>): string {
  const out = text.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, k: string) => vars[k] ?? "");
  return out.replace(/\n{3,}/g, "\n\n").trim();
}

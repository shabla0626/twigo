// Organization-wide permissions. Pure data: safe to import anywhere on the server.
//
// ADMIN permissions are listed explicitly; ADMIN does not inherit everything
// OWNER can do. Group-level roles (COORDINATOR / MEMBER) are separate and are
// checked in src/server/community/access.ts. They never grant any of these.
import type { UserRole } from "@prisma/client";

export const PERMISSIONS = [
  "admin.access", // open the admin dashboard at all
  "applications.view",
  "applications.review", // status changes, notes
  "applications.erase",
  "applications.export",
  "participants.manage",
  "participants.remove", // delete a participant record (owner only)
  "projects.manage",
  "projects.delete", // delete a project and its records (owner only)
  "compensation.view", // private compensation records
  "compensation.manage",
  "finance.view", // future financial reporting (Phase 3)
  "members.view",
  "members.invite",
  "members.suspend",
  "moderation.act", // ideas, comments, discussions, reports
  "groups.manage", // archive, suspend, coordinator reassignment
  "groups.approve_project", // group -> project transition
  "email.send",
  "email.templates",
  "content.edit",
  "inquiries.manage",
  "audit.view",
  "data.export", // personal-data exports for access requests
  "retention.preview",
  "retention.run",
  "backups.manage",
  "settings.manage", // organization settings (thresholds, retention periods)
  "admins.manage", // create / change / remove administrators
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const ADMIN: Permission[] = [
  "admin.access",
  "applications.view",
  "applications.review",
  "applications.export",
  "participants.manage",
  "projects.manage",
  "members.view",
  "members.invite",
  "members.suspend",
  "moderation.act",
  "groups.manage",
  "email.send",
  "content.edit",
  "inquiries.manage",
  "audit.view",
  "retention.preview",
];

export const ROLE_PERMISSIONS: Record<UserRole, readonly Permission[]> = {
  OWNER: PERMISSIONS,
  ADMIN,
  MEMBER: [],
};

export function can(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function isAdminRole(role: UserRole): boolean {
  return can(role, "admin.access");
}

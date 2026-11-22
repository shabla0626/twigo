export const SESSION_COOKIE = process.env.NODE_ENV === "production" ? "__Host-cw_session" : "cw_session";
export const MAX_FAILED_LOGINS = 5;
export const LOCKOUT_MINUTES = 15;
/** Sensitive actions require a password/2FA confirmation within this window. */
export const REAUTH_MINUTES = 10;
/** Unauthenticated second-factor step must be completed within this window. */
export const MFA_PENDING_MINUTES = 10;
/** An owner or administrator who has done nothing for this long must sign in again. */
export const ADMIN_IDLE_MINUTES = 60;
/** Holds the address on the "check your email" page right after sign-up, so it is never part of a page address. */
export const PENDING_EMAIL_COOKIE = "cw_pending_email";
export const TOKEN_TTL_HOURS = { INVITE: 24 * 7, VERIFY_EMAIL: 24, RESET_PASSWORD: 1 } as const;

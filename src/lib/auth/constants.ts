export const SESSION_COOKIE = process.env.NODE_ENV === "production" ? "__Host-cw_session" : "cw_session";
export const MAX_FAILED_LOGINS = 5;
export const LOCKOUT_MINUTES = 15;
/** Sensitive actions require a password/2FA confirmation within this window. */
export const REAUTH_MINUTES = 10;
/** Unauthenticated second-factor step must be completed within this window. */
export const MFA_PENDING_MINUTES = 10;
export const TOKEN_TTL_HOURS = { INVITE: 24 * 7, VERIFY_EMAIL: 24, RESET_PASSWORD: 1 } as const;

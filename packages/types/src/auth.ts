import { z } from "zod";

import { emailSchema } from "./primitives";

export const passwordSchema = z
  .string()
  .min(10, "Password must be at least 10 characters")
  .max(128, "Password must be at most 128 characters");

export const signupSchema = z.object({
  email: emailSchema,
  name: z.string().trim().min(1, "Name is required").max(120),
  password: passwordSchema,
});
export type SignupInput = z.infer<typeof signupSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Password is required").max(128),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const tokenSchema = z.string().min(20).max(200);

export const verifyEmailSchema = z.object({ token: tokenSchema });
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;

export const forgotPasswordSchema = z.object({ email: emailSchema });
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({
  token: tokenSchema,
  password: passwordSchema,
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

// ---- MFA ------------------------------------------------------------------------------------

// A 6-digit TOTP or a recovery code (XXXXX-XXXXX); the API decides which it is.
export const mfaCodeSchema = z.string().trim().min(6, "Enter the code").max(16);

export const mfaVerifySchema = z.object({
  challengeToken: tokenSchema,
  code: mfaCodeSchema,
});
export type MfaVerifyInput = z.infer<typeof mfaVerifySchema>;

export const mfaEnableSchema = z.object({ code: mfaCodeSchema });
export type MfaEnableInput = z.infer<typeof mfaEnableSchema>;

export const mfaDisableSchema = z.object({
  password: z.string().min(1, "Password is required").max(128),
  code: mfaCodeSchema,
});
export type MfaDisableInput = z.infer<typeof mfaDisableSchema>;

export const passwordConfirmSchema = z.object({
  password: z.string().min(1, "Password is required").max(128),
});
export type PasswordConfirmInput = z.infer<typeof passwordConfirmSchema>;

export interface MfaStatus {
  enabled: boolean;
  enabledAt: string | null;
  recoveryCodesRemaining: number;
}

export interface MfaSetupResponse {
  secret: string;
  otpauthUrl: string;
  qrDataUrl: string;
}

// ---- Responses ------------------------------------------------------------------------------

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
  createdAt: string;
  mfaEnabled?: boolean;
}

export type LoginResponse =
  { user: AuthUser; mfaRequired?: undefined } | { mfaRequired: true; challengeToken: string };

export interface SessionSummary {
  id: string;
  current: boolean;
  createdAt: string;
  lastSeenAt: string;
  ip: string | null;
  userAgent: string | null;
  mfaVerified: boolean;
}

export interface LoginEventSummary {
  id: string;
  outcome: "success" | "failed_password" | "failed_mfa" | "mfa_required" | "locked";
  ip: string | null;
  userAgent: string | null;
  riskFlags: string[];
  createdAt: string;
}

export interface MeStore {
  id: string;
  name: string;
  slug: string;
  status: string;
  defaultCurrency: string;
  defaultLocale: string;
  timezone: string;
  onboardingState: Record<string, boolean>;
  role: string | null;
  permissions: string[];
}

export interface MeOrganization {
  id: string;
  name: string;
  slug: string;
  role: string;
  permissions: string[];
  stores: MeStore[];
}

export interface MeResponse {
  user: AuthUser;
  organizations: MeOrganization[];
}

import { z } from "zod";

// The process environment is a system boundary: validate once at boot, then
// inject the typed result. Nothing else in the API reads process.env directly.
export const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    API_PORT: z.coerce.number().int().positive().default(4000),
    API_CORS_ORIGINS: z
      .string()
      .default("")
      .transform((v) =>
        v
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      ),
    DATABASE_URL: z.string().url(),
    REDIS_URL: z.string().url(),
    SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters"),
    SESSION_IDLE_TTL_SECONDS: z.coerce.number().int().positive().default(604800),
    SESSION_ABSOLUTE_TTL_SECONDS: z.coerce.number().int().positive().default(2592000),
    COOKIE_SECURE: z
      .enum(["true", "false"])
      .optional()
      .transform((v) => (v === undefined ? undefined : v === "true")),
    ADMIN_URL: z.string().url(),
    MAIL_FROM: z.string().min(3).default("Ocean Commerce <no-reply@localhost>"),
    // 32 bytes hex — encrypts secrets at rest (TOTP seeds, app tokens). Rotate via versioned prefix.
    ENCRYPTION_KEY: z
      .string()
      .regex(/^[0-9a-fA-F]{64}$/, "ENCRYPTION_KEY must be 64 hex characters (32 bytes)"),
    STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
    STORAGE_LOCAL_DIR: z.string().default(".storage"),
    MEDIA_PUBLIC_URL: z.string().url().default("http://localhost:4000/media"),
    S3_ENDPOINT: z.string().url().optional(),
    S3_REGION: z.string().default("us-east-1"),
    S3_BUCKET: z.string().optional(),
    S3_ACCESS_KEY: z.string().optional(),
    S3_SECRET_KEY: z.string().optional(),
    S3_FORCE_PATH_STYLE: z
      .enum(["true", "false"])
      .default("true")
      .transform((v) => v === "true"),
  })
  .transform((env) => ({
    ...env,
    COOKIE_SECURE: env.COOKIE_SECURE ?? env.NODE_ENV === "production",
  }));

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const details = result.error.issues
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${details}`);
  }
  return result.data;
}

-- CreateEnum
CREATE TYPE "LoginOutcome" AS ENUM ('success', 'failed_password', 'failed_mfa', 'mfa_required', 'locked');

-- CreateTable
CREATE TABLE "user_mfa" (
    "user_id" UUID NOT NULL,
    "totp_secret_enc" TEXT NOT NULL,
    "enabled_at" TIMESTAMPTZ(6),
    "recovery_code_hashes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "user_mfa_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "login_events" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "email" TEXT NOT NULL,
    "ip" TEXT,
    "user_agent" TEXT,
    "outcome" "LoginOutcome" NOT NULL,
    "risk_flags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "session_id" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "login_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "login_events_user_id_created_at_idx" ON "login_events"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "login_events_email_created_at_idx" ON "login_events"("email", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "user_mfa" ADD CONSTRAINT "user_mfa_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "login_events" ADD CONSTRAINT "login_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


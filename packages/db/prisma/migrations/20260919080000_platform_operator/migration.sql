-- Platform operators: Ocean's own internal staff, provisioned out of band (seed/console), never
-- a merchant or store member. Backs the new apps/platform-admin app's own session realm.
-- CreateEnum
CREATE TYPE "PlatformOperatorStatus" AS ENUM ('active', 'suspended');

-- CreateTable
CREATE TABLE "platform_operators" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "status" "PlatformOperatorStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "platform_operators_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "platform_operators_email_key" ON "platform_operators"("email");

-- CreateEnum
CREATE TYPE "CustomerStatus" AS ENUM ('active', 'disabled');

-- CreateEnum
CREATE TYPE "MarketingConsent" AS ENUM ('not_subscribed', 'subscribed', 'unsubscribed');

-- CreateEnum
CREATE TYPE "CompanyStatus" AS ENUM ('active', 'suspended', 'archived');

-- CreateEnum
CREATE TYPE "CompanyRole" AS ENUM ('company_admin', 'buyer', 'approver', 'finance', 'viewer');

-- CreateEnum
CREATE TYPE "CompanyUserStatus" AS ENUM ('active', 'disabled');

-- CreateEnum
CREATE TYPE "CompanyApplicationStatus" AS ENUM ('pending', 'under_review', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "CompanyApplicationSource" AS ENUM ('storefront', 'admin');

-- CreateTable
CREATE TABLE "customers" (
    "id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "first_name" TEXT,
    "last_name" TEXT,
    "phone" TEXT,
    "status" "CustomerStatus" NOT NULL DEFAULT 'active',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "note" TEXT,
    "locale" TEXT,
    "tax_exempt" BOOLEAN NOT NULL DEFAULT false,
    "email_marketing" "MarketingConsent" NOT NULL DEFAULT 'not_subscribed',
    "email_marketing_updated_at" TIMESTAMPTZ(6),
    "password_hash" TEXT,
    "account_activated_at" TIMESTAMPTZ(6),
    "orders_count" INTEGER NOT NULL DEFAULT 0,
    "total_spent" BIGINT NOT NULL DEFAULT 0,
    "last_order_at" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_addresses" (
    "id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "address" JSONB NOT NULL,
    "is_default_shipping" BOOLEAN NOT NULL DEFAULT false,
    "is_default_billing" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "customer_addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "companies" (
    "id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "legal_name" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "tax_number" TEXT,
    "tax_office" TEXT,
    "industry" TEXT,
    "currency" CHAR(3) NOT NULL,
    "status" "CompanyStatus" NOT NULL DEFAULT 'active',
    "account_manager_id" UUID,
    "external_id" TEXT,
    "website" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "note" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_locations" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "external_id" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "shipping_address" JSONB NOT NULL,
    "billing_address" JSONB,
    "currency" CHAR(3),
    "tax_exempt" BOOLEAN NOT NULL DEFAULT false,
    "tax_number" TEXT,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "company_locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_users" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "role" "CompanyRole" NOT NULL,
    "status" "CompanyUserStatus" NOT NULL DEFAULT 'active',
    "title" TEXT,
    "all_locations" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "company_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_user_locations" (
    "company_user_id" UUID NOT NULL,
    "company_location_id" UUID NOT NULL,

    CONSTRAINT "company_user_locations_pkey" PRIMARY KEY ("company_user_id","company_location_id")
);

-- CreateTable
CREATE TABLE "company_applications" (
    "id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "status" "CompanyApplicationStatus" NOT NULL DEFAULT 'pending',
    "source" "CompanyApplicationSource" NOT NULL DEFAULT 'storefront',
    "legal_name" TEXT NOT NULL,
    "display_name" TEXT,
    "tax_number" TEXT,
    "tax_office" TEXT,
    "industry" TEXT,
    "website" TEXT,
    "expected_monthly_volume" TEXT,
    "contact_first_name" TEXT NOT NULL,
    "contact_last_name" TEXT NOT NULL,
    "contact_email" TEXT NOT NULL,
    "contact_phone" TEXT,
    "address" JSONB,
    "message" TEXT,
    "customer_id" UUID,
    "reviewer_id" UUID,
    "reviewed_at" TIMESTAMPTZ(6),
    "decision_note" TEXT,
    "company_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "company_applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_application_documents" (
    "application_id" UUID NOT NULL,
    "media_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "company_application_documents_pkey" PRIMARY KEY ("application_id","media_id")
);

-- CreateIndex
CREATE INDEX "customers_store_id_created_at_idx" ON "customers"("store_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "customers_store_id_status_idx" ON "customers"("store_id", "status");

-- CreateIndex
CREATE INDEX "customers_store_id_email_idx" ON "customers"("store_id", "email");

-- CreateIndex
CREATE INDEX "customers_store_id_last_name_first_name_idx" ON "customers"("store_id", "last_name", "first_name");

-- CreateIndex
CREATE INDEX "customer_addresses_customer_id_idx" ON "customer_addresses"("customer_id");

-- CreateIndex
CREATE INDEX "customer_addresses_store_id_idx" ON "customer_addresses"("store_id");

-- CreateIndex
CREATE INDEX "companies_store_id_created_at_idx" ON "companies"("store_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "companies_store_id_status_idx" ON "companies"("store_id", "status");

-- CreateIndex
CREATE INDEX "companies_store_id_display_name_idx" ON "companies"("store_id", "display_name");

-- CreateIndex
CREATE INDEX "companies_store_id_account_manager_id_idx" ON "companies"("store_id", "account_manager_id");

-- CreateIndex
CREATE INDEX "company_locations_store_id_company_id_idx" ON "company_locations"("store_id", "company_id");

-- CreateIndex
CREATE UNIQUE INDEX "company_locations_company_id_name_key" ON "company_locations"("company_id", "name");

-- CreateIndex
CREATE INDEX "company_users_store_id_customer_id_idx" ON "company_users"("store_id", "customer_id");

-- CreateIndex
CREATE INDEX "company_users_store_id_company_id_idx" ON "company_users"("store_id", "company_id");

-- CreateIndex
CREATE UNIQUE INDEX "company_users_company_id_customer_id_key" ON "company_users"("company_id", "customer_id");

-- CreateIndex
CREATE INDEX "company_user_locations_company_location_id_idx" ON "company_user_locations"("company_location_id");

-- CreateIndex
CREATE INDEX "company_applications_store_id_status_created_at_idx" ON "company_applications"("store_id", "status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "company_applications_store_id_contact_email_idx" ON "company_applications"("store_id", "contact_email");

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_addresses" ADD CONSTRAINT "customer_addresses_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "companies" ADD CONSTRAINT "companies_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "companies" ADD CONSTRAINT "companies_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "companies" ADD CONSTRAINT "companies_account_manager_id_fkey" FOREIGN KEY ("account_manager_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_locations" ADD CONSTRAINT "company_locations_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_locations" ADD CONSTRAINT "company_locations_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_locations" ADD CONSTRAINT "company_locations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_users" ADD CONSTRAINT "company_users_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_users" ADD CONSTRAINT "company_users_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_users" ADD CONSTRAINT "company_users_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_users" ADD CONSTRAINT "company_users_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_user_locations" ADD CONSTRAINT "company_user_locations_company_user_id_fkey" FOREIGN KEY ("company_user_id") REFERENCES "company_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_user_locations" ADD CONSTRAINT "company_user_locations_company_location_id_fkey" FOREIGN KEY ("company_location_id") REFERENCES "company_locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_applications" ADD CONSTRAINT "company_applications_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_applications" ADD CONSTRAINT "company_applications_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_applications" ADD CONSTRAINT "company_applications_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_applications" ADD CONSTRAINT "company_applications_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_applications" ADD CONSTRAINT "company_applications_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_application_documents" ADD CONSTRAINT "company_application_documents_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "company_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_application_documents" ADD CONSTRAINT "company_application_documents_media_id_fkey" FOREIGN KEY ("media_id") REFERENCES "media"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- One live customer per email per store; soft-deleted rows free the address again.
CREATE UNIQUE INDEX "customers_store_id_email_key" ON "customers"("store_id", "email") WHERE "deleted_at" IS NULL;

-- Tax numbers identify a live company within a store.
CREATE UNIQUE INDEX "companies_store_id_tax_number_key" ON "companies"("store_id", "tax_number") WHERE "tax_number" IS NOT NULL AND "deleted_at" IS NULL;
CREATE UNIQUE INDEX "companies_store_id_external_id_key" ON "companies"("store_id", "external_id") WHERE "external_id" IS NOT NULL AND "deleted_at" IS NULL;

-- Exactly one default location per company; at most one default shipping/billing address per customer.
CREATE UNIQUE INDEX "company_locations_company_id_default_key" ON "company_locations"("company_id") WHERE "is_default" = true;
CREATE UNIQUE INDEX "customer_addresses_default_shipping_key" ON "customer_addresses"("customer_id") WHERE "is_default_shipping" = true;
CREATE UNIQUE INDEX "customer_addresses_default_billing_key" ON "customer_addresses"("customer_id") WHERE "is_default_billing" = true;

ALTER TABLE "customers" ADD CONSTRAINT "customers_counters_nonnegative" CHECK ("orders_count" >= 0 AND "total_spent" >= 0);

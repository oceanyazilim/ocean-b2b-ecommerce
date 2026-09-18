-- CreateTable
CREATE TABLE "themes" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(100) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "category" VARCHAR(100),
    "status" VARCHAR(50) NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "themes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "theme_releases" (
    "id" UUID NOT NULL,
    "theme_id" UUID NOT NULL,
    "version" VARCHAR(50) NOT NULL,
    "manifest" JSONB NOT NULL,
    "released_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "theme_releases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "store_themes" (
    "id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "theme_id" UUID NOT NULL,
    "theme_release_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "role" VARCHAR(50) NOT NULL DEFAULT 'unpublished',
    "published_version_id" UUID,
    "published_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "store_themes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "store_theme_versions" (
    "id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "store_theme_id" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "global_settings" JSONB NOT NULL DEFAULT '{}',
    "status" VARCHAR(50) NOT NULL DEFAULT 'draft',
    "etag" VARCHAR(255) NOT NULL,
    "created_by" UUID,
    "note" TEXT,
    "published_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "store_theme_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "theme_template_versions" (
    "id" UUID NOT NULL,
    "theme_version_id" UUID NOT NULL,
    "template_type" VARCHAR(100) NOT NULL,
    "template_name" VARCHAR(100) NOT NULL,
    "configuration" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "theme_template_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "theme_preview_tokens" (
    "id" UUID NOT NULL,
    "store_theme_version_id" UUID NOT NULL,
    "token_hash" VARCHAR(255) NOT NULL,
    "password_hash" VARCHAR(255),
    "expires_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "theme_preview_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "themes_slug_key" ON "themes"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "theme_releases_theme_id_version_key" ON "theme_releases"("theme_id", "version");

-- CreateIndex
CREATE INDEX "store_themes_store_id_idx" ON "store_themes"("store_id");

-- CreateIndex
CREATE INDEX "store_theme_versions_store_id_idx" ON "store_theme_versions"("store_id");

-- CreateIndex
CREATE UNIQUE INDEX "store_theme_versions_store_theme_id_number_key" ON "store_theme_versions"("store_theme_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "theme_template_versions_theme_version_id_template_type_temp_key" ON "theme_template_versions"("theme_version_id", "template_type", "template_name");

-- CreateIndex
CREATE INDEX "theme_preview_tokens_store_theme_version_id_idx" ON "theme_preview_tokens"("store_theme_version_id");

-- AddForeignKey
ALTER TABLE "theme_releases" ADD CONSTRAINT "theme_releases_theme_id_fkey" FOREIGN KEY ("theme_id") REFERENCES "themes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "store_themes" ADD CONSTRAINT "store_themes_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "store_themes" ADD CONSTRAINT "store_themes_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "store_themes" ADD CONSTRAINT "store_themes_theme_id_fkey" FOREIGN KEY ("theme_id") REFERENCES "themes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "store_themes" ADD CONSTRAINT "store_themes_theme_release_id_fkey" FOREIGN KEY ("theme_release_id") REFERENCES "theme_releases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "store_theme_versions" ADD CONSTRAINT "store_theme_versions_store_theme_id_fkey" FOREIGN KEY ("store_theme_id") REFERENCES "store_themes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "theme_template_versions" ADD CONSTRAINT "theme_template_versions_theme_version_id_fkey" FOREIGN KEY ("theme_version_id") REFERENCES "store_theme_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "theme_preview_tokens" ADD CONSTRAINT "theme_preview_tokens_store_theme_version_id_fkey" FOREIGN KEY ("store_theme_version_id") REFERENCES "store_theme_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

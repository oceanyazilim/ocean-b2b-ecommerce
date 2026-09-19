-- Mega menu support: additive, nullable/defaulted columns on menu_items so existing menus
-- keep working unchanged.
ALTER TABLE "menu_items"
  ADD COLUMN "link_type" TEXT,
  ADD COLUMN "resource_id" UUID,
  ADD COLUMN "mega_menu_enabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "promo_image_url" TEXT,
  ADD COLUMN "promo_image_alt" TEXT,
  ADD COLUMN "promo_link_label" TEXT,
  ADD COLUMN "promo_link_url" TEXT;

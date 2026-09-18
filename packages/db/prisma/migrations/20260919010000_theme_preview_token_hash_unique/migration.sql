-- Theme preview tokens are looked up by hash (Prisma findUnique); the column needs a real
-- unique index for that to be correct (and fast), matching the existing user_tokens pattern.
CREATE UNIQUE INDEX "theme_preview_tokens_token_hash_key" ON "theme_preview_tokens"("token_hash");

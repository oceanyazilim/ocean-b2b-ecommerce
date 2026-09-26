# Yeni cihazda projeye devam — Claude Code'a yazılacak prompt

Aşağıdaki "PROMPT" bölümünü, projeyi klonladığın klasörde Claude Code'u açıp olduğu gibi yapıştır.

---

## PROMPT

Merhaba. Bu proje **Ocean Commerce**: çok kiracılı (multi-tenant) B2B / toptan / DTC e-ticaret SaaS platformu.
Projeyi başka bir bilgisayardan GitHub üzerinden bu cihaza taşıdım, burada geliştirmeye devam edeceğim.
Benimle Türkçe konuş.

**Önce projeyi tanı (kısa tut, gereksiz dosya gezme):**
1. `README.md` ve `docs/architecture/00-overview.md` dosyalarını oku.
2. `docs/architecture/13-phases-and-testing.md` dosyasından faz yol haritasına bak.
3. `git log --oneline -20` ile son yapılanları gör.

**Projenin durumu:**
- Faz 0–16 tamamlandı. Üstüne code-review düzeltme turu, Shopify tarzı UI yeniden tasarımı ve
  Dashboard modları (Operations / Analytics / B2B / Finance) + gerçek Revenue Breakdown da yapıldı.
- Sırada bekleyen yeni bir faz yok; ne yapacağımızı ben söyleyeceğim.
- Yapı: `apps/` (marketing :3000, admin :3001, storefront :3002, platform-admin :3003, api :4000 NestJS)
  ve `packages/` (config, db = Prisma, types = zod, permissions = RBAC, ui, utils). pnpm + Turborepo.

**Bu cihazda kurulum adımlarını benimle birlikte yap:**
1. Node 22+ ve `npm i -g pnpm@10` kurulu mu kontrol et, `pnpm install` çalıştır.
   (pnpm 10 postinstall scriptlerini engeller; izin listesi kök `package.json` → `pnpm.onlyBuiltDependencies`.)
2. `.env` dosyaları: kök `.env` ve `apps/api/.env` var mı kontrol et. Yoksa `.env.example`'dan oluştur
   ve eksik değerleri bana sor.
3. Altyapı: Docker varsa `pnpm infra:up`. Docker yoksa README'deki "Without Docker (native Windows)"
   bölümüne göre PostgreSQL 16 (kullanıcı `ocean`/`ocean`, veritabanı `ocean_dev`) + Memurai (Redis, 6379)
   + Meilisearch (7700, master key `.env`'deki `MEILI_MASTER_KEY` ile aynı) kur.
4. `pnpm db:generate`, sonra `pnpm db:migrate`, sonra `pnpm db:seed`.
   Not: Prisma CLI kök `.env`'i okumaz (cwd `packages/db`), `DATABASE_URL`'i shell'de export et.
   Not: Windows'ta API çalışırken `prisma generate` boş "Error:" ile düşer, önce API'yi durdur.
5. `pnpm typecheck` ve `pnpm test` ile her şeyin yeşil olduğunu doğrula, sonra `pnpm dev`.

**Çalışma kurallarım:**
- Küçük adımlarla ilerle, gereksiz keşif yapma, doğrulamaları toplu yap (kullanım limitim var).
- Commit'leri "Emirhan Kılıç <emirhanklcpersonal@gmail.com>" adına at; git config'i değiştirme,
  `git -c user.name=... -c user.email=... commit` kullan.
- Başka bir yapay zekâ (Gemini/Antigravity) aynı anda backend üzerinde çalışabilir. Ben aksini
  söylemedikçe sen UI tarafında çalış ve `git add -A` / `git add .` ile toplu stage yapma; sadece
  kendi değiştirdiğin dosyaları ekle.
- Storefront'u lokalde test ederken host adıyla mağaza çözülür: `http://localhost:3002` 404 verir,
  `Domain` tablosundaki bir hostname (ör. `demo-store.localhost:3002`) ile aç.
- Chrome ile doğrulamada arama-seçici satırlarına koordinatla değil find()+ref ile tıkla; dialog
  yüklemede takılırsa konsolu kontrol et.

Bu bilgileri kalıcı hafızana (memory) kaydet, kurulumu tamamlayınca bana özet ver ve ne yapmak
istediğimi sor.

---

## Kurulumdan önce senin yapman gerekenler

```
git clone https://github.com/oceanyazilim/ocean-b2b-ecommerce.git
cd ocean-b2b-ecommerce
```

`.env` dosyaları repoda yok. Eski bilgisayardan kök `.env` ve `apps/api/.env` dosyalarını
(USB, şifreli bulut vb. ile) aynı konumlara kopyala. Yoksa Claude `.env.example`'dan oluşturur.

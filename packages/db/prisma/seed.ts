import { hash } from "@node-rs/argon2";

import { PrismaClient } from "../generated/client";

const prisma = new PrismaClient();

const DEMO_EMAIL = "owner@demo.local";
const DEMO_PASSWORD = "DemoPass123!";

async function main(): Promise<void> {
  const passwordHash = await hash(DEMO_PASSWORD, {
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 1,
  });

  const user = await prisma.user.upsert({
    where: { email: DEMO_EMAIL },
    update: { passwordHash, emailVerifiedAt: new Date() },
    create: {
      email: DEMO_EMAIL,
      name: "Demo Owner",
      passwordHash,
      emailVerifiedAt: new Date(),
    },
  });

  const organization = await prisma.organization.upsert({
    where: { slug: "demo-holding" },
    update: {},
    create: { name: "Demo Holding", slug: "demo-holding" },
  });

  await prisma.organizationMember.upsert({
    where: { organizationId_userId: { organizationId: organization.id, userId: user.id } },
    update: { role: "owner", status: "active" },
    create: { organizationId: organization.id, userId: user.id, role: "owner" },
  });

  const store = await prisma.store.upsert({
    where: { slug: "demo-wholesale" },
    update: {},
    create: {
      organizationId: organization.id,
      name: "Demo Wholesale",
      slug: "demo-wholesale",
      defaultCurrency: "TRY",
      defaultLocale: "tr",
      timezone: "Europe/Istanbul",
      businessType: "wholesale",
      industry: "industrial_supplies",
    },
  });

  await prisma.storeMember.upsert({
    where: { storeId_userId: { storeId: store.id, userId: user.id } },
    update: { role: "store_owner", status: "active" },
    create: {
      storeId: store.id,
      organizationId: organization.id,
      userId: user.id,
      role: "store_owner",
    },
  });

  console.warn(`Seeded ${DEMO_EMAIL} / ${DEMO_PASSWORD} -> ${organization.slug} / ${store.slug}`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

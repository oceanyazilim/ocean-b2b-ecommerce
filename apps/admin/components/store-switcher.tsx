"use client";

import { Select } from "@ocean/ui";
import { useTranslations } from "next-intl";
import { usePathname, useRouter } from "next/navigation";

export interface SwitcherStore {
  slug: string;
  name: string;
  organizationName: string;
}

export function StoreSwitcher({ stores, current }: { stores: SwitcherStore[]; current: string }) {
  const t = useTranslations("shell.header");
  const router = useRouter();
  const pathname = usePathname();

  function go(slug: string) {
    // Keep the sub-page (e.g. /settings/team) when switching stores.
    const rest = pathname.split("/").slice(2).join("/");
    router.push(rest ? `/${slug}/${rest}` : `/${slug}`);
  }

  if (stores.length <= 1) {
    const only = stores[0];
    return <span className="truncate text-sm font-semibold">{only?.name ?? current}</span>;
  }

  return (
    <Select
      aria-label={t("switchStore")}
      value={current}
      onChange={(e) => go(e.target.value)}
      className="h-8 w-auto max-w-[220px]"
    >
      {stores.map((s) => (
        <option key={s.slug} value={s.slug}>
          {s.name} · {s.organizationName}
        </option>
      ))}
    </Select>
  );
}

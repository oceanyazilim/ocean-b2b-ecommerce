import type { PlatformCountrySummary } from "@ocean/types";
import { Badge, Card, CardContent, CardHeader, CardTitle, EmptyState } from "@ocean/ui";

// Spec section 32's exact example row: "Turkey / Status: Active / Admin language support: TR/EN /
// Storefront locales: tr-TR, en-US / Default currency: TRY / Tax engine: Configured / Business
// schemas: 5 / Address schema: Configured / Invoice configuration: Configured." Admin-language
// support is platform-wide, not per-country (only TR/EN exist, per L1's admin i18n phase — see
// PLATFORM_ADMIN_LANGUAGES in @ocean/types), so it's a fixed footnote here rather than a column
// computed per row.
export function CountriesClient({ countries }: { countries: PlatformCountrySummary[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Country configuration</CardTitle>
        <p className="text-sm text-muted-foreground">
          Admin language support (Türkçe / English) is the same for every country — the admin
          shell's own i18n, not something configured per country.
        </p>
      </CardHeader>
      <CardContent className={countries.length ? "p-0" : undefined}>
        {countries.length === 0 ? (
          <EmptyState title="No countries configured" description="No CountryProfile rows exist yet." />
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-6 py-2.5">Country</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5">Storefront locales</th>
                <th className="px-4 py-2.5">Default currency</th>
                <th className="px-4 py-2.5">Tax engine</th>
                <th className="px-4 py-2.5">Business schemas</th>
                <th className="px-4 py-2.5">Address schema</th>
                <th className="px-4 py-2.5">Invoice configuration</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {countries.map((c) => (
                <tr key={c.countryCode} className="hover:bg-muted/60">
                  <td className="px-6 py-3">
                    <span className="font-medium">{c.name}</span>
                    <span className="ml-2 text-xs text-muted-foreground">{c.countryCode}</span>
                    <div className="text-xs text-muted-foreground">v{c.version}</div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={c.isActive ? "success" : "secondary"}>
                      {c.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {c.storefrontLocales.length > 0 ? c.storefrontLocales.join(", ") : "—"}
                  </td>
                  <td className="px-4 py-3 tabular-nums">{c.defaultCurrency ?? "—"}</td>
                  <td className="px-4 py-3">
                    <Badge variant={c.taxEngineConfigured ? "success" : "secondary"}>
                      {c.taxEngineConfigured ? "Configured" : "Not configured"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 tabular-nums">{c.businessSchemaCount}</td>
                  <td className="px-4 py-3">
                    <Badge variant={c.addressSchemaConfigured ? "success" : "secondary"}>
                      {c.addressSchemaConfigured ? "Configured" : "Not configured"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={c.invoiceConfigurationConfigured ? "success" : "secondary"}>
                      {c.invoiceConfigurationConfigured ? "Configured" : "Not configured"}
                    </Badge>
                    {c.invoiceConfiguredStoreCount > 0 && (
                      <span className="ml-1.5 text-xs text-muted-foreground">
                        ({c.invoiceConfiguredStoreCount} store
                        {c.invoiceConfiguredStoreCount === 1 ? "" : "s"})
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}

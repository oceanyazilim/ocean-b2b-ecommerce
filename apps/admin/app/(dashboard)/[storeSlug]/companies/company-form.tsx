"use client";

import {
  COMPANY_STATUSES,
  TAX_ID_VALIDATION_STATUSES,
  type AccountManagerCandidate,
  type CompanyDetail,
  type CompanyStatus,
  type CountryProfileSummary,
  type CreditAccountSummary,
  type MetafieldDefinitionSummary,
  type MetafieldValue,
  type TaxIdFormat,
  type TaxIdValidationStatus,
} from "@ocean/types";
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ConfirmDialog,
  FormField,
  Input,
  Select,
  TagInput,
  Textarea,
} from "@ocean/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

import {
  AddressFields,
  draftToAddress,
  emptyAddress,
  isAddressBlank,
  type AddressDraft,
} from "@/components/address-fields";
import { CollapsibleCard } from "@/components/collapsible-card";
import { MetafieldsCard, metafieldDrafts, saveMetafields } from "@/components/metafields-card";
import { api, ApiClientError } from "@/lib/api";
import { formatMoney } from "@/lib/money";
import { useSubmit } from "@/lib/use-submit";

interface OrderStats {
  count: number;
  lifetimeValue: { amount: number; currency: string };
  lastOrderAt: string | null;
  hasMore: boolean;
}

const FORM_ID = "company-form";

export function CompanyForm({
  storeId,
  storeSlug,
  storeCurrency,
  company,
  managers,
  definitions,
  metafields,
  readOnly = false,
  companyCredit = null,
  locationCredit = [],
  canViewCredit = false,
  orderStats = null,
}: {
  storeId: string;
  storeSlug: string;
  storeCurrency: string;
  company: CompanyDetail | null;
  managers: AccountManagerCandidate[];
  definitions: MetafieldDefinitionSummary[];
  metafields: MetafieldValue[];
  readOnly?: boolean;
  // Real Credit module (Phase 12) data: the credit account attached directly to this company, plus
  // any attached to one of its locations. Both undefined/empty when the account manager can't read
  // credit or no account exists — never a fabricated limit.
  companyCredit?: CreditAccountSummary | null;
  locationCredit?: CreditAccountSummary[];
  canViewCredit?: boolean;
  // Real aggregate over this company's own orders (see the overview page for how it's computed).
  // Null when the viewer can't read orders.
  orderStats?: OrderStats | null;
}) {
  const router = useRouter();
  const { pending, error, fieldErrors, run } = useSubmit();
  const [legalName, setLegalName] = useState(company?.legalName ?? "");
  const [displayName, setDisplayName] = useState(company?.displayName ?? "");
  const [taxNumber, setTaxNumber] = useState(company?.taxNumber ?? "");
  const [taxOffice, setTaxOffice] = useState(company?.taxOffice ?? "");
  const [taxCountryCode, setTaxCountryCode] = useState(company?.taxCountryCode ?? "");
  const [taxIdType, setTaxIdType] = useState(company?.taxIdType ?? "");
  const [taxValidationStatus, setTaxValidationStatus] = useState<TaxIdValidationStatus>(
    company?.taxValidationStatus ?? "unverified",
  );
  const [taxTreatment, setTaxTreatment] = useState(company?.taxTreatment ?? "");
  const [countries, setCountries] = useState<CountryProfileSummary[]>([]);
  const [taxIdFormats, setTaxIdFormats] = useState<TaxIdFormat[]>([]);
  const [industry, setIndustry] = useState(company?.industry ?? "");
  const [currency, setCurrency] = useState(company?.currency ?? storeCurrency);
  const [status, setStatus] = useState<CompanyStatus>(company?.status ?? "active");
  const [accountManagerId, setAccountManagerId] = useState(company?.accountManager?.id ?? "");
  const [externalId, setExternalId] = useState(company?.externalId ?? "");
  const [website, setWebsite] = useState(company?.website ?? "");
  const [phone, setPhone] = useState(company?.phone ?? "");
  const [email, setEmail] = useState(company?.email ?? "");
  const [note, setNote] = useState(company?.note ?? "");
  const [tags, setTags] = useState<string[]>(company?.tags ?? []);
  const [locationName, setLocationName] = useState("Head office");
  const [address, setAddress] = useState<AddressDraft>(emptyAddress());
  const [meta, setMeta] = useState(metafieldDrafts(metafields));
  const [version, setVersion] = useState(company?.version ?? 1);
  const [conflict, setConflict] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saved, setSaved] = useState(false);

  // Global Country Engine (L1): the list of countries with a real CountryProfile, used to pick
  // the company's tax country and, from that, the right dynamic tax-id label (spec section 27) —
  // never a single hardcoded "Tax ID" field.
  useEffect(() => {
    void api<{ data: CountryProfileSummary[] }>("/countries")
      .then((res) => setCountries(res.data))
      .catch(() => setCountries([]));
  }, []);

  useEffect(() => {
    if (!taxCountryCode) {
      setTaxIdFormats([]);
      return;
    }
    let cancelled = false;
    void api<{ data: { taxIdFormats: TaxIdFormat[] } }>(`/countries/${taxCountryCode}`)
      .then((res) => {
        if (!cancelled) setTaxIdFormats(res.data.taxIdFormats);
      })
      .catch(() => {
        if (!cancelled) setTaxIdFormats([]);
      });
    return () => {
      cancelled = true;
    };
  }, [taxCountryCode]);

  const activeTaxIdFormat =
    taxIdFormats.find((f) => f.code === taxIdType) ?? taxIdFormats[0] ?? null;
  const taxNumberLabel = activeTaxIdFormat?.label ?? "Tax number";

  const orNull = (v: string) => (v.trim() ? v.trim() : null);
  const payload = () => ({
    legalName,
    displayName: displayName.trim() || legalName,
    taxNumber: orNull(taxNumber),
    taxOffice: orNull(taxOffice),
    taxCountryCode: taxCountryCode || null,
    taxIdType: orNull(taxIdType),
    taxValidationStatus,
    taxTreatment: orNull(taxTreatment),
    industry: orNull(industry),
    currency: currency.trim().toUpperCase(),
    status,
    accountManagerId: accountManagerId || null,
    externalId: orNull(externalId),
    website: orNull(website),
    phone: orNull(phone),
    email: orNull(email),
    note: orNull(note),
    tags,
  });

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setConflict(false);
    setSaved(false);
    const res = await run(async () => {
      try {
        const result = company
          ? await api<{ data: CompanyDetail }>(`/stores/${storeId}/companies/${company.id}`, {
              method: "PATCH",
              body: { ...payload(), version },
            })
          : await api<{ data: CompanyDetail }>(`/stores/${storeId}/companies`, {
              body: {
                ...payload(),
                ...(isAddressBlank(address)
                  ? {}
                  : {
                      location: {
                        name: locationName.trim() || "Head office",
                        shippingAddress: draftToAddress(address),
                      },
                    }),
              },
            });
        await saveMetafields(
          `/stores/${storeId}/companies/${result.data.id}/metafields`,
          definitions,
          meta,
        );
        return result.data;
      } catch (err) {
        if (err instanceof ApiClientError && err.code === "conflict" && !err.fields.length) {
          setConflict(true);
        }
        throw err;
      }
    });
    if (!res) return;
    if (!company) {
      router.push(`/${storeSlug}/companies/${res.id}`);
      return;
    }
    setVersion(res.version);
    setSaved(true);
    router.refresh();
  }

  async function onDelete() {
    if (!company) return;
    const ok = await run(() =>
      api(`/stores/${storeId}/companies/${company.id}`, { method: "DELETE" }),
    );
    if (ok !== undefined) router.push(`/${storeSlug}/companies`);
  }

  const metaError = Object.entries(fieldErrors).find(([p]) => p.startsWith("metafields"))?.[1];

  return (
    <div className="flex flex-col gap-6">
      {!company && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Link
              href={`/${storeSlug}/companies`}
              className="text-sm text-muted-foreground hover:underline"
            >
              ← Companies
            </Link>
            <h1 className="text-2xl font-semibold tracking-tight">New company</h1>
          </div>
        </div>
      )}
      {!readOnly && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          {company && (
            <Button type="button" variant="ghost" onClick={() => setConfirmDelete(true)}>
              Delete company
            </Button>
          )}
          <Button type="submit" form={FORM_ID} loading={pending}>
            {company ? "Save" : "Create company"}
          </Button>
        </div>
      )}

      {conflict && (
        <Alert variant="warning" title="Someone else saved this company">
          Reload the page to see their changes, then apply yours again.
        </Alert>
      )}
      {error && !conflict && <Alert variant="error">{error}</Alert>}
      {saved && <Alert variant="success">Saved.</Alert>}

      <form
        id={FORM_ID}
        onSubmit={(e) => void onSubmit(e)}
        className="grid grid-cols-1 gap-6 lg:grid-cols-[2fr_1fr]"
      >
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Company</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FormField
                id="co-legal"
                label="Legal name"
                error={fieldErrors.legalName}
                className="sm:col-span-2"
              >
                <Input
                  id="co-legal"
                  value={legalName}
                  onChange={(e) => setLegalName(e.target.value)}
                  required
                  maxLength={200}
                  disabled={readOnly}
                  invalid={!!fieldErrors.legalName}
                  autoFocus={!company}
                />
              </FormField>
              <FormField
                id="co-display"
                label="Display name"
                hint="Shown in the admin and storefront. Defaults to the legal name."
                error={fieldErrors.displayName}
                className="sm:col-span-2"
              >
                <Input
                  id="co-display"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  maxLength={200}
                  disabled={readOnly}
                />
              </FormField>
              <FormField id="co-industry" label="Industry" error={fieldErrors.industry}>
                <Input
                  id="co-industry"
                  value={industry}
                  onChange={(e) => setIndustry(e.target.value)}
                  maxLength={80}
                  disabled={readOnly}
                />
              </FormField>
              <FormField
                id="co-external"
                label="External ID"
                hint="ERP / accounting customer number"
                error={fieldErrors.externalId}
              >
                <Input
                  id="co-external"
                  value={externalId}
                  onChange={(e) => setExternalId(e.target.value)}
                  maxLength={80}
                  disabled={readOnly}
                  invalid={!!fieldErrors.externalId}
                />
              </FormField>
              <FormField id="co-website" label="Website" error={fieldErrors.website}>
                <Input
                  id="co-website"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  maxLength={200}
                  disabled={readOnly}
                  invalid={!!fieldErrors.website}
                />
              </FormField>
              <FormField id="co-email" label="Email" error={fieldErrors.email}>
                <Input
                  id="co-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  maxLength={254}
                  disabled={readOnly}
                  invalid={!!fieldErrors.email}
                />
              </FormField>
              <FormField id="co-phone" label="Phone" error={fieldErrors.phone}>
                <Input
                  id="co-phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  maxLength={40}
                  disabled={readOnly}
                />
              </FormField>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Tax information</CardTitle>
              <CardDescription>
                Country-specific B2B tax details (spec sections 26-27). The tax-id field&apos;s
                label — VKN, VAT ID, EIN, ... — is driven by the selected country&apos;s real
                CountryProfile, never a generic &quot;Tax ID&quot;.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FormField id="co-tax-country" label="Country">
                <Select
                  id="co-tax-country"
                  value={taxCountryCode}
                  onChange={(e) => {
                    setTaxCountryCode(e.target.value);
                    setTaxIdType("");
                  }}
                  disabled={readOnly}
                >
                  <option value="">Not set</option>
                  {countries.map((c) => (
                    <option key={c.countryCode} value={c.countryCode}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </FormField>
              {taxIdFormats.length > 0 && (
                <FormField id="co-tax-id-type" label="Tax ID type">
                  <Select
                    id="co-tax-id-type"
                    value={taxIdType}
                    onChange={(e) => setTaxIdType(e.target.value)}
                    disabled={readOnly}
                  >
                    {taxIdFormats.map((f) => (
                      <option key={f.code} value={f.code}>
                        {f.label}
                      </option>
                    ))}
                  </Select>
                </FormField>
              )}
              <FormField id="co-tax" label={taxNumberLabel} error={fieldErrors.taxNumber}>
                <Input
                  id="co-tax"
                  value={taxNumber}
                  onChange={(e) => setTaxNumber(e.target.value)}
                  maxLength={40}
                  disabled={readOnly}
                  invalid={!!fieldErrors.taxNumber}
                  placeholder={activeTaxIdFormat?.example}
                />
              </FormField>
              <FormField id="co-office" label="Tax office" error={fieldErrors.taxOffice}>
                <Input
                  id="co-office"
                  value={taxOffice}
                  onChange={(e) => setTaxOffice(e.target.value)}
                  maxLength={120}
                  disabled={readOnly}
                />
              </FormField>
              <FormField id="co-tax-status" label="Validation status">
                <Select
                  id="co-tax-status"
                  value={taxValidationStatus}
                  onChange={(e) => setTaxValidationStatus(e.target.value as TaxIdValidationStatus)}
                  disabled={readOnly}
                >
                  {TAX_ID_VALIDATION_STATUSES.map((s) => (
                    <option key={s} value={s} className="capitalize">
                      {s}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField
                id="co-tax-treatment"
                label="Tax treatment"
                hint='Free-text note, e.g. "Reverse charge" for intra-EU B2B.'
              >
                <Input
                  id="co-tax-treatment"
                  value={taxTreatment}
                  onChange={(e) => setTaxTreatment(e.target.value)}
                  maxLength={120}
                  disabled={readOnly}
                />
              </FormField>
            </CardContent>
          </Card>

          {!company && (
            <Card>
              <CardHeader>
                <CardTitle>First location</CardTitle>
                <CardDescription>
                  Optional. Becomes the default ship-to location; add more under Locations later.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <FormField
                  id="co-loc-name"
                  label="Location name"
                  error={fieldErrors["location.name"]}
                >
                  <Input
                    id="co-loc-name"
                    value={locationName}
                    onChange={(e) => setLocationName(e.target.value)}
                    maxLength={120}
                  />
                </FormField>
                <AddressFields
                  idPrefix="co-addr"
                  value={address}
                  onChange={setAddress}
                  errors={fieldErrors}
                  prefix="location.shippingAddress"
                  showName={false}
                />
              </CardContent>
            </Card>
          )}

          <MetafieldsCard
            definitions={definitions}
            values={meta}
            onChange={setMeta}
            error={metaError}
            readOnly={readOnly}
          />
        </div>

        <div className="flex flex-col gap-6">
          {company && (canViewCredit || orderStats) && (
            <Card>
              <CardHeader>
                <CardTitle>Snapshot</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-3 text-sm">
                {orderStats && (
                  <>
                    <div>
                      <div className="text-muted-foreground">Orders</div>
                      <div className="text-lg font-semibold tabular-nums">
                        {orderStats.hasMore ? `${orderStats.count}+` : orderStats.count}
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Lifetime value</div>
                      <div className="text-lg font-semibold tabular-nums">
                        {orderStats.hasMore ? "at least " : ""}
                        {formatMoney(orderStats.lifetimeValue)}
                      </div>
                    </div>
                  </>
                )}
                {canViewCredit && (
                  <>
                    <div>
                      <div className="text-muted-foreground">Credit limit</div>
                      <div className="text-lg font-semibold tabular-nums">
                        {companyCredit ? formatMoney(companyCredit.limit) : "No credit account"}
                      </div>
                    </div>
                    {companyCredit && (
                      <div>
                        <div className="text-muted-foreground">Outstanding balance</div>
                        <div className="text-lg font-semibold tabular-nums">
                          {formatMoney(companyCredit.used)}
                        </div>
                      </div>
                    )}
                  </>
                )}
                <div className="col-span-2 text-xs text-muted-foreground">
                  {orderStats?.lastOrderAt
                    ? `Last order ${new Date(orderStats.lastOrderAt).toLocaleDateString()}`
                    : orderStats
                      ? "No orders yet."
                      : null}
                </div>
                {canViewCredit && locationCredit.length > 0 && (
                  <div className="col-span-2 flex flex-col gap-1 border-t pt-2 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">Per-location credit</span>
                    {locationCredit.map((a) => {
                      const location = company.locations.find((l) => l.id === a.companyLocationId);
                      return (
                        <div key={a.id} className="flex items-center justify-between gap-2">
                          <span>{location?.name ?? "Unknown location"}</span>
                          <span className="tabular-nums">
                            {formatMoney(a.used)} / {formatMoney(a.limit)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
                {canViewCredit && (
                  <Link
                    href={`/${storeSlug}/quotes/credit`}
                    className="col-span-2 text-xs text-muted-foreground hover:underline"
                  >
                    Manage credit accounts →
                  </Link>
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Account</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <FormField id="co-status" label="Status">
                <Select
                  id="co-status"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as CompanyStatus)}
                  disabled={readOnly}
                >
                  {COMPANY_STATUSES.map((s) => (
                    <option key={s} value={s} className="capitalize">
                      {s}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField
                id="co-currency"
                label="Currency"
                hint="ISO 4217; locations may override."
                error={fieldErrors.currency}
              >
                <Input
                  id="co-currency"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                  maxLength={3}
                  disabled={readOnly}
                  invalid={!!fieldErrors.currency}
                />
              </FormField>
              <FormField
                id="co-manager"
                label="Account manager"
                error={fieldErrors.accountManagerId}
              >
                <Select
                  id="co-manager"
                  value={accountManagerId}
                  onChange={(e) => setAccountManagerId(e.target.value)}
                  disabled={readOnly}
                >
                  <option value="">Unassigned</option>
                  {managers.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} · {m.email}
                    </option>
                  ))}
                </Select>
              </FormField>
            </CardContent>
          </Card>

          <CollapsibleCard title="Tags & notes" contentClassName="flex flex-col gap-3">
            <FormField id="co-tags" label="Tags" error={fieldErrors.tags}>
              <TagInput id="co-tags" value={tags} onChange={setTags} disabled={readOnly} />
            </FormField>
            <FormField id="co-note" label="Internal note" error={fieldErrors.note}>
              <Textarea
                id="co-note"
                rows={4}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={2000}
                disabled={readOnly}
              />
            </FormField>
          </CollapsibleCard>
        </div>
      </form>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={onDelete}
        title={`Delete ${company?.displayName ?? "company"}?`}
        description="Buyers lose access to this account immediately. Locations and history are kept for records."
        confirmLabel="Delete"
        destructive
        pending={pending}
      />
    </div>
  );
}

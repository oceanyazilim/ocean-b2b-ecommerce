"use client";

import {
  COMPANY_STATUSES,
  type AccountManagerCandidate,
  type CompanyDetail,
  type CompanyStatus,
  type MetafieldDefinitionSummary,
  type MetafieldValue,
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
import { useState, type FormEvent } from "react";

import {
  AddressFields,
  draftToAddress,
  emptyAddress,
  isAddressBlank,
  type AddressDraft,
} from "@/components/address-fields";
import { MetafieldsCard, metafieldDrafts, saveMetafields } from "@/components/metafields-card";
import { api, ApiClientError } from "@/lib/api";
import { useSubmit } from "@/lib/use-submit";

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
}: {
  storeId: string;
  storeSlug: string;
  storeCurrency: string;
  company: CompanyDetail | null;
  managers: AccountManagerCandidate[];
  definitions: MetafieldDefinitionSummary[];
  metafields: MetafieldValue[];
  readOnly?: boolean;
}) {
  const router = useRouter();
  const { pending, error, fieldErrors, run } = useSubmit();
  const [legalName, setLegalName] = useState(company?.legalName ?? "");
  const [displayName, setDisplayName] = useState(company?.displayName ?? "");
  const [taxNumber, setTaxNumber] = useState(company?.taxNumber ?? "");
  const [taxOffice, setTaxOffice] = useState(company?.taxOffice ?? "");
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

  const orNull = (v: string) => (v.trim() ? v.trim() : null);
  const payload = () => ({
    legalName,
    displayName: displayName.trim() || legalName,
    taxNumber: orNull(taxNumber),
    taxOffice: orNull(taxOffice),
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
              <FormField id="co-tax" label="Tax number" error={fieldErrors.taxNumber}>
                <Input
                  id="co-tax"
                  value={taxNumber}
                  onChange={(e) => setTaxNumber(e.target.value)}
                  maxLength={40}
                  disabled={readOnly}
                  invalid={!!fieldErrors.taxNumber}
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

          <Card>
            <CardHeader>
              <CardTitle>Tags &amp; notes</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
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
            </CardContent>
          </Card>
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

"use client";

import {
  MARKETING_CONSENTS,
  type CustomerDetail,
  type CustomerStatus,
  type MarketingConsent,
  type MetafieldDefinitionSummary,
  type MetafieldValue,
} from "@ocean/types";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Checkbox,
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
import { formatMoney } from "@/lib/money";
import { useSubmit } from "@/lib/use-submit";

import { CustomerAddresses } from "./customer-addresses";

const CONSENT_LABEL: Record<MarketingConsent, string> = {
  not_subscribed: "Not subscribed",
  subscribed: "Subscribed",
  unsubscribed: "Unsubscribed",
};

const FORM_ID = "customer-form";

// The editable fields live in one <form>; the address manager (which opens its own dialog
// forms) and the company list render outside it so forms never nest.
export function CustomerForm({
  storeId,
  storeSlug,
  customer,
  definitions,
  metafields,
  readOnly = false,
}: {
  storeId: string;
  storeSlug: string;
  customer: CustomerDetail | null;
  definitions: MetafieldDefinitionSummary[];
  metafields: MetafieldValue[];
  readOnly?: boolean;
}) {
  const router = useRouter();
  const { pending, error, fieldErrors, run } = useSubmit();
  const [email, setEmail] = useState(customer?.email ?? "");
  const [firstName, setFirstName] = useState(customer?.firstName ?? "");
  const [lastName, setLastName] = useState(customer?.lastName ?? "");
  const [phone, setPhone] = useState(customer?.phone ?? "");
  const [status, setStatus] = useState<CustomerStatus>(customer?.status ?? "active");
  const [tags, setTags] = useState<string[]>(customer?.tags ?? []);
  const [note, setNote] = useState(customer?.note ?? "");
  const [locale, setLocale] = useState(customer?.locale ?? "");
  const [taxExempt, setTaxExempt] = useState(customer?.taxExempt ?? false);
  const [consent, setConsent] = useState<MarketingConsent>(
    customer?.emailMarketing ?? "not_subscribed",
  );
  const [address, setAddress] = useState<AddressDraft>(emptyAddress());
  const [meta, setMeta] = useState(metafieldDrafts(metafields));
  const [version, setVersion] = useState(customer?.version ?? 1);
  const [conflict, setConflict] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saved, setSaved] = useState(false);

  const payload = () => ({
    email,
    firstName: firstName.trim() || null,
    lastName: lastName.trim() || null,
    phone: phone.trim() || null,
    status,
    tags,
    note: note.trim() || null,
    locale: locale.trim() || null,
    taxExempt,
    emailMarketing: consent,
  });

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setConflict(false);
    setSaved(false);
    const res = await run(async () => {
      try {
        const result = customer
          ? await api<{ data: CustomerDetail }>(`/stores/${storeId}/customers/${customer.id}`, {
              method: "PATCH",
              body: { ...payload(), version },
            })
          : await api<{ data: CustomerDetail }>(`/stores/${storeId}/customers`, {
              body: {
                ...payload(),
                addresses: isAddressBlank(address) ? [] : [draftToAddress(address)],
              },
            });
        await saveMetafields(
          `/stores/${storeId}/customers/${result.data.id}/metafields`,
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
    if (!customer) {
      router.push(`/${storeSlug}/customers/${res.id}`);
      return;
    }
    setVersion(res.version);
    setSaved(true);
    router.refresh();
  }

  async function onDelete() {
    if (!customer) return;
    const ok = await run(() =>
      api(`/stores/${storeId}/customers/${customer.id}`, { method: "DELETE" }),
    );
    if (ok !== undefined) router.push(`/${storeSlug}/customers`);
  }

  const title = customer ? customer.displayName : "New customer";
  const metaError = Object.entries(fieldErrors).find(([p]) => p.startsWith("metafields"))?.[1];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <Link
            href={`/${storeSlug}/customers`}
            className="text-sm text-muted-foreground hover:underline"
          >
            ← Customers
          </Link>
          <h1 className="truncate text-2xl font-semibold tracking-tight">{title}</h1>
          {customer && (
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <Badge variant={customer.status === "active" ? "success" : "secondary"}>
                {customer.status}
              </Badge>
              {customer.kind === "company_buyer" && <Badge>Company buyer</Badge>}
              <span>
                {customer.hasAccount ? "Has storefront account" : "No storefront account"}
              </span>
              <span>· Added {new Date(customer.createdAt).toLocaleDateString()}</span>
            </div>
          )}
        </div>
        {!readOnly && (
          <div className="flex items-center gap-2">
            {customer && (
              <Button type="button" variant="ghost" onClick={() => setConfirmDelete(true)}>
                Delete
              </Button>
            )}
            <Button type="submit" form={FORM_ID} loading={pending}>
              {customer ? "Save" : "Create customer"}
            </Button>
          </div>
        )}
      </div>

      {conflict && (
        <Alert variant="warning" title="Someone else saved this customer">
          Reload the page to see their changes, then apply yours again.
        </Alert>
      )}
      {error && !conflict && <Alert variant="error">{error}</Alert>}
      {saved && <Alert variant="success">Saved.</Alert>}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[2fr_1fr] lg:items-start">
        <form id={FORM_ID} onSubmit={(e) => void onSubmit(e)} className="contents">
          <div className="flex flex-col gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Contact</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <FormField id="c-first" label="First name" error={fieldErrors.firstName}>
                  <Input
                    id="c-first"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    maxLength={80}
                    disabled={readOnly}
                    autoFocus={!customer}
                  />
                </FormField>
                <FormField id="c-last" label="Last name" error={fieldErrors.lastName}>
                  <Input
                    id="c-last"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    maxLength={80}
                    disabled={readOnly}
                  />
                </FormField>
                <FormField id="c-email" label="Email" error={fieldErrors.email}>
                  <Input
                    id="c-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    maxLength={254}
                    disabled={readOnly}
                    invalid={!!fieldErrors.email}
                  />
                </FormField>
                <FormField id="c-phone" label="Phone" error={fieldErrors.phone}>
                  <Input
                    id="c-phone"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    maxLength={40}
                    disabled={readOnly}
                  />
                </FormField>
                <FormField
                  id="c-locale"
                  label="Preferred language"
                  hint="e.g. tr or en-GB"
                  error={fieldErrors.locale}
                >
                  <Input
                    id="c-locale"
                    value={locale}
                    onChange={(e) => setLocale(e.target.value)}
                    maxLength={5}
                    disabled={readOnly}
                    invalid={!!fieldErrors.locale}
                  />
                </FormField>
              </CardContent>
            </Card>

            {!customer && (
              <Card>
                <CardHeader>
                  <CardTitle>Address</CardTitle>
                  <CardDescription>
                    Optional. Becomes the default shipping and billing address.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <AddressFields
                    idPrefix="c-addr"
                    value={address}
                    onChange={setAddress}
                    errors={fieldErrors}
                    prefix="addresses.0"
                    showName={false}
                    required={false}
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

          <div className="flex flex-col gap-6 lg:row-span-2">
            {customer && (
              <Card>
                <CardHeader>
                  <CardTitle>Activity</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <div className="text-muted-foreground">Orders</div>
                    <div className="text-lg font-semibold tabular-nums">{customer.ordersCount}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Total spent</div>
                    <div className="text-lg font-semibold tabular-nums">
                      {formatMoney(customer.totalSpent)}
                    </div>
                  </div>
                  <div className="col-span-2 text-xs text-muted-foreground">
                    {customer.lastOrderAt
                      ? `Last order ${new Date(customer.lastOrderAt).toLocaleDateString()}`
                      : "No orders yet (orders arrive in Phase 6)."}
                  </div>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle>Status &amp; consent</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <FormField id="c-status" label="Account status">
                  <Select
                    id="c-status"
                    value={status}
                    onChange={(e) => setStatus(e.target.value as CustomerStatus)}
                    disabled={readOnly}
                  >
                    <option value="active">Active</option>
                    <option value="disabled">Disabled</option>
                  </Select>
                </FormField>
                <FormField
                  id="c-consent"
                  label="Email marketing"
                  hint={
                    customer?.emailMarketingUpdatedAt
                      ? `Changed ${new Date(customer.emailMarketingUpdatedAt).toLocaleString()}`
                      : undefined
                  }
                >
                  <Select
                    id="c-consent"
                    value={consent}
                    onChange={(e) => setConsent(e.target.value as MarketingConsent)}
                    disabled={readOnly}
                  >
                    {MARKETING_CONSENTS.map((c) => (
                      <option key={c} value={c}>
                        {CONSENT_LABEL[c]}
                      </option>
                    ))}
                  </Select>
                </FormField>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={taxExempt}
                    onChange={(e) => setTaxExempt(e.target.checked)}
                    disabled={readOnly}
                  />
                  Tax exempt
                </label>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Tags &amp; notes</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <FormField id="c-tags" label="Tags" error={fieldErrors.tags}>
                  <TagInput id="c-tags" value={tags} onChange={setTags} disabled={readOnly} />
                </FormField>
                <FormField id="c-note" label="Note" error={fieldErrors.note}>
                  <Textarea
                    id="c-note"
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

        {customer && (
          <div className="flex flex-col gap-6">
            <CustomerAddresses storeId={storeId} customer={customer} readOnly={readOnly} />
            {customer.companies.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Companies</CardTitle>
                  <CardDescription>
                    B2B accounts this customer can buy on behalf of.
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col divide-y">
                  {customer.companies.map((m) => (
                    <div
                      key={m.companyUserId}
                      className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
                    >
                      <div>
                        <Link
                          href={`/${storeSlug}/companies/${m.companyId}/users`}
                          className="font-medium hover:underline"
                        >
                          {m.companyName}
                        </Link>
                        <div className="text-xs text-muted-foreground">
                          {m.allLocations
                            ? "All locations"
                            : m.locationNames.join(", ") || "No locations"}
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <Badge variant="secondary">{m.role.replace(/_/g, " ")}</Badge>
                        {m.status !== "active" && <Badge variant="warning">{m.status}</Badge>}
                        {m.companyStatus !== "active" && (
                          <Badge variant="warning">company {m.companyStatus}</Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={onDelete}
        title={`Delete ${title}?`}
        description="The customer is removed from every company and hidden from lists. Their order history is kept."
        confirmLabel="Delete"
        destructive
        pending={pending}
      />
    </div>
  );
}

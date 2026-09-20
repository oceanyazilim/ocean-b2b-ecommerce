"use client";

import type { BankInfo, InvoiceSettingsSummary, UpdateInvoiceSettingsInput } from "@ocean/types";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  FormField,
  Input,
  Textarea,
} from "@ocean/ui";
import { useState, type FormEvent } from "react";

import { api } from "@/lib/api";
import { useSubmit } from "@/lib/use-submit";

// Finance -> Invoicing -> Settings (spec section 28). Every field below is a real, persisted
// InvoiceSettings column — see InvoicingSettingsService. Two are genuinely wired into real
// invoice output today: `invoicePrefix` (read when FinanceService.create() generates
// Invoice.number) and everything here except invoicePrefix/numberingStart (embedded live as
// InvoiceDetail.issuer on every invoice response). `numberingStart` only takes effect once, and
// only while the store has issued zero invoices — the banner below explains why when it can't.
export function InvoiceSettingsForm({
  storeId,
  initial,
  canWrite,
}: {
  storeId: string;
  initial: InvoiceSettingsSummary;
  canWrite: boolean;
}) {
  const submit = useSubmit();
  const [settings, setSettings] = useState(initial);
  const [invoicePrefix, setInvoicePrefix] = useState(initial.invoicePrefix);
  const [numberingStart, setNumberingStart] = useState(
    initial.numberingStart !== null ? String(initial.numberingStart) : "",
  );
  const [legalName, setLegalName] = useState(initial.legalName ?? "");
  const [taxId, setTaxId] = useState(initial.taxId ?? "");
  const [registeredAddress, setRegisteredAddress] = useState(initial.registeredAddress ?? "");
  const [bankInfo, setBankInfo] = useState<BankInfo>(initial.bankInfo ?? {});
  const [footerNotice, setFooterNotice] = useState(initial.footerNotice ?? "");
  const [currency, setCurrency] = useState(initial.currency);
  const [language, setLanguage] = useState(initial.language);

  function bankField(key: keyof BankInfo, value: string) {
    setBankInfo((prev) => ({ ...prev, [key]: value || undefined }));
  }

  // Resyncs every per-field input from a fresh server response, not just the `settings` summary
  // object — otherwise the ~9 field inputs below keep showing pre-save client values while
  // `settings.configured`/`settings.numberingCanApply` (the badge and the numbering-start
  // disabled state) reflect the new response, and those two sources of truth can silently
  // diverge (e.g. if the server normalizes a field on save).
  function applySettings(data: InvoiceSettingsSummary) {
    setSettings(data);
    setInvoicePrefix(data.invoicePrefix);
    setNumberingStart(data.numberingStart !== null ? String(data.numberingStart) : "");
    setLegalName(data.legalName ?? "");
    setTaxId(data.taxId ?? "");
    setRegisteredAddress(data.registeredAddress ?? "");
    setBankInfo(data.bankInfo ?? {});
    setFooterNotice(data.footerNotice ?? "");
    setCurrency(data.currency);
    setLanguage(data.language);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const body: UpdateInvoiceSettingsInput = {
      invoicePrefix,
      numberingStart: numberingStart.trim() ? Number(numberingStart) : null,
      legalName: legalName.trim() || null,
      taxId: taxId.trim() || null,
      registeredAddress: registeredAddress.trim() || null,
      bankInfo: Object.values(bankInfo).some(Boolean) ? bankInfo : null,
      footerNotice: footerNotice.trim() || null,
      currency,
      language,
    };
    const res = await submit.run(() =>
      api<{ data: InvoiceSettingsSummary }>(`/stores/${storeId}/invoicing/settings`, {
        method: "PUT",
        body,
      }),
    );
    if (res) applySettings(res.data);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Invoice configuration
          <Badge variant={settings.configured ? "success" : "secondary"}>
            {settings.configured ? "Configured" : "Using defaults"}
          </Badge>
        </CardTitle>
        <CardDescription>
          {settings.configured
            ? "Saved for this store. Values not set below fall back to store/organization defaults."
            : "Nothing saved yet — every field below shows a computed default (from this store's name, currency and language)."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-4">
          {submit.error && <Alert variant="error">{submit.error}</Alert>}
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              id="invoice-prefix"
              label="Invoice prefix"
              hint='Prepended to the running number, e.g. "INV-" -> INV-1000'
              error={submit.fieldErrors.invoicePrefix}
            >
              <Input
                id="invoice-prefix"
                value={invoicePrefix}
                onChange={(e) => setInvoicePrefix(e.target.value)}
                maxLength={20}
                disabled={!canWrite}
                required
              />
            </FormField>
            <FormField
              id="numbering-start"
              label="Numbering starts at"
              hint={
                settings.numberingCanApply
                  ? "Applies once, the next invoice this store issues."
                  : "This store has already issued invoices — numbering can no longer be re-seeded."
              }
              error={submit.fieldErrors.numberingStart}
            >
              <Input
                id="numbering-start"
                type="number"
                min={1}
                value={numberingStart}
                onChange={(e) => setNumberingStart(e.target.value)}
                disabled={!canWrite || !settings.numberingCanApply}
              />
            </FormField>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="legal-name" label="Legal company name" error={submit.fieldErrors.legalName}>
              <Input
                id="legal-name"
                value={legalName}
                onChange={(e) => setLegalName(e.target.value)}
                maxLength={200}
                disabled={!canWrite}
                placeholder="Defaults to the organization name"
              />
            </FormField>
            <FormField id="tax-id" label="Tax identifier" error={submit.fieldErrors.taxId}>
              <Input
                id="tax-id"
                value={taxId}
                onChange={(e) => setTaxId(e.target.value)}
                maxLength={80}
                disabled={!canWrite}
                placeholder="Defaults to an active tax registration, if any"
              />
            </FormField>
          </div>
          <FormField
            id="registered-address"
            label="Registered address"
            error={submit.fieldErrors.registeredAddress}
          >
            <Textarea
              id="registered-address"
              rows={2}
              value={registeredAddress}
              onChange={(e) => setRegisteredAddress(e.target.value)}
              maxLength={2000}
              disabled={!canWrite}
            />
          </FormField>
          <div className="rounded-md border p-3">
            <p className="mb-2 text-sm font-medium">Bank information</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField id="bank-name" label="Bank name">
                <Input
                  id="bank-name"
                  value={bankInfo.bankName ?? ""}
                  onChange={(e) => bankField("bankName", e.target.value)}
                  disabled={!canWrite}
                />
              </FormField>
              <FormField id="bank-account-name" label="Account name">
                <Input
                  id="bank-account-name"
                  value={bankInfo.accountName ?? ""}
                  onChange={(e) => bankField("accountName", e.target.value)}
                  disabled={!canWrite}
                />
              </FormField>
              <FormField id="bank-account-number" label="Account number / IBAN">
                <Input
                  id="bank-account-number"
                  value={bankInfo.accountNumber ?? ""}
                  onChange={(e) => bankField("accountNumber", e.target.value)}
                  disabled={!canWrite}
                />
              </FormField>
              <FormField id="bank-swift" label="SWIFT / BIC">
                <Input
                  id="bank-swift"
                  value={bankInfo.swiftBic ?? ""}
                  onChange={(e) => bankField("swiftBic", e.target.value)}
                  disabled={!canWrite}
                />
              </FormField>
              <FormField
                id="bank-routing"
                label="Other routing detail"
                hint="e.g. a US routing number or a GB sort code"
              >
                <Input
                  id="bank-routing"
                  value={bankInfo.routingDetail ?? ""}
                  onChange={(e) => bankField("routingDetail", e.target.value)}
                  disabled={!canWrite}
                />
              </FormField>
            </div>
          </div>
          <FormField id="footer-notice" label="Footer / legal notices" error={submit.fieldErrors.footerNotice}>
            <Textarea
              id="footer-notice"
              rows={3}
              value={footerNotice}
              onChange={(e) => setFooterNotice(e.target.value)}
              maxLength={2000}
              disabled={!canWrite}
            />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="currency" label="Currency" error={submit.fieldErrors.currency}>
              <Input
                id="currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                maxLength={3}
                disabled={!canWrite}
              />
            </FormField>
            <FormField id="language" label="Language" error={submit.fieldErrors.language}>
              <Input
                id="language"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                maxLength={20}
                disabled={!canWrite}
              />
            </FormField>
          </div>
          {canWrite && (
            <div>
              <Button type="submit" loading={submit.pending}>
                Save invoicing settings
              </Button>
            </div>
          )}
        </form>
      </CardContent>
    </Card>
  );
}

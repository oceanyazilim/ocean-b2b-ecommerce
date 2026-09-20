"use client";

import {
  TAX_REGISTRATION_STATUSES,
  type CountryProfileSummary,
  type TaxRegistrationCountryGroup,
  type TaxRegistrationStatus,
  type TaxRegistrationSummary,
} from "@ocean/types";
import {
  Alert,
  Badge,
  type BadgeVariant,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ConfirmDialog,
  Dialog,
  FormField,
  Input,
  Select,
  Textarea,
} from "@ocean/ui";
import { useCallback, useEffect, useState, type FormEvent } from "react";

import { api, errorMessage } from "@/lib/api";
import { useSubmit } from "@/lib/use-submit";

type Editing =
  | { kind: "new" }
  | { kind: "edit"; countryCode: string; registration: TaxRegistrationSummary }
  | null;

const STATUS_VARIANT: Record<TaxRegistrationStatus, BadgeVariant> = {
  active: "success",
  pending: "warning",
  not_registered: "secondary",
};
const STATUS_LABEL: Record<TaxRegistrationStatus, string> = {
  active: "Active",
  pending: "Pending",
  not_registered: "Not registered",
};

// Spec section 21 ("Taxes -> Registrations") + section 22 ("UI terminology must change
// depending on country ... never universally display the word VAT"). Grouped by country like
// the spec's own examples ("Turkey / VAT registration / Active", "United States / Sales tax / 3
// registrations"), and every label the API hands back is the real local term from that
// country's CountryProfile.taxTerminology — nothing here is hardcoded.
export function TaxRegistrationsManager({
  storeId,
  canWrite,
}: {
  storeId: string;
  canWrite: boolean;
}) {
  const [groups, setGroups] = useState<TaxRegistrationCountryGroup[]>([]);
  const [countries, setCountries] = useState<CountryProfileSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing>(null);
  const [deleting, setDeleting] = useState<TaxRegistrationSummary | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const action = useSubmit();

  const load = useCallback(async () => {
    setError(null);
    try {
      const [regs, countryList] = await Promise.all([
        api<{ data: TaxRegistrationCountryGroup[] }>(`/stores/${storeId}/tax/registrations`),
        api<{ data: CountryProfileSummary[] }>("/countries"),
      ]);
      setGroups(regs.data);
      setCountries(countryList.data);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function mutate(id: string, fn: () => Promise<unknown>) {
    setBusyId(id);
    const ok = await action.run(fn);
    setBusyId(null);
    if (ok !== undefined) await load();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Which countries (and regions) you&apos;re tax-registered in. Labels come from each
          country&apos;s real tax terminology — Turkey shows KDV, the US shows Sales Tax, never a
          generic &quot;VAT&quot;.
        </p>
        {canWrite && <Button onClick={() => setEditing({ kind: "new" })}>Add registration</Button>}
      </div>
      {(error ?? action.error) && <Alert variant="error">{error ?? action.error}</Alert>}
      {!loading && groups.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No tax registrations yet.
          </CardContent>
        </Card>
      )}
      {groups.map((group) => (
        <Card key={group.countryCode}>
          <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
            <div>
              <CardTitle className="flex items-center gap-2">
                {group.countryName ?? group.countryCode}
                <Badge variant="outline">{group.countryCode}</Badge>
              </CardTitle>
              {group.taxTerminology && (
                <p className="mt-1 text-sm text-muted-foreground">
                  {group.taxTerminology.localName}
                  {group.taxTerminology.localName !== group.taxTerminology.englishName &&
                    ` (${group.taxTerminology.englishName})`}
                  {group.registrations.length > 1 && ` · ${group.activeCount} active`}
                </p>
              )}
            </div>
          </CardHeader>
          <CardContent className="flex flex-col divide-y">
            {group.registrations.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div className="flex flex-col">
                  <span className="text-sm font-medium">
                    {r.registrationType}
                    {r.regionCode && <span className="text-muted-foreground"> · {r.regionCode}</span>}
                  </span>
                  {r.registrationNumber && (
                    <span className="text-xs text-muted-foreground">{r.registrationNumber}</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={STATUS_VARIANT[r.status]}>{STATUS_LABEL[r.status]}</Badge>
                  {canWrite && (
                    <>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          setEditing({ kind: "edit", countryCode: group.countryCode, registration: r })
                        }
                      >
                        Edit
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setDeleting(r)}>
                        Remove
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
      <RegistrationDialog
        storeId={storeId}
        editing={editing}
        countries={countries}
        onClose={() => setEditing(null)}
        onSaved={() => void load()}
      />
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title="Remove this tax registration?"
        destructive
        pending={busyId === deleting?.id}
        onConfirm={async () => {
          if (!deleting) return;
          await mutate(deleting.id, () =>
            api(`/stores/${storeId}/tax/registrations/${deleting.id}`, { method: "DELETE" }),
          );
          setDeleting(null);
        }}
      />
    </div>
  );
}

function RegistrationDialog({
  storeId,
  editing,
  countries,
  onClose,
  onSaved,
}: {
  storeId: string;
  editing: Editing;
  countries: CountryProfileSummary[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const submit = useSubmit();
  const { reset } = submit;
  const [countryCode, setCountryCode] = useState("");
  const [regionCode, setRegionCode] = useState("");
  const [registrationType, setRegistrationType] = useState("");
  const [registrationNumber, setRegistrationNumber] = useState("");
  const [status, setStatus] = useState<TaxRegistrationStatus>("not_registered");
  const [notes, setNotes] = useState("");
  const current = editing?.kind === "edit" ? editing.registration : null;

  useEffect(() => {
    reset();
    setCountryCode(current?.countryCode ?? "");
    setRegionCode(current?.regionCode ?? "");
    setRegistrationType(current?.registrationType ?? "");
    setRegistrationNumber(current?.registrationNumber ?? "");
    setStatus(current?.status ?? "not_registered");
    setNotes(current?.notes ?? "");
  }, [current, editing, reset]);

  // Pre-fill the registration type from the country's real tax system once picked, e.g. "vat"
  // for Turkey/Germany, "sales_tax" for the US — editable, never forced.
  function onCountryChange(code: string) {
    setCountryCode(code);
    if (!registrationType) {
      const profile = countries.find((c) => c.countryCode === code);
      if (profile) setRegistrationType(profile.taxSystemType);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const body = {
      countryCode: countryCode.trim().toUpperCase(),
      regionCode: regionCode.trim() ? regionCode.trim().toUpperCase() : null,
      registrationType,
      registrationNumber: registrationNumber.trim() || null,
      status,
      notes: notes.trim() || null,
    };
    const res = await submit.run(() =>
      current
        ? api(`/stores/${storeId}/tax/registrations/${current.id}`, { method: "PATCH", body })
        : api(`/stores/${storeId}/tax/registrations`, { body }),
    );
    if (res !== undefined) {
      onSaved();
      onClose();
    }
  }

  return (
    <Dialog
      open={editing !== null}
      onClose={onClose}
      title={current ? "Edit tax registration" : "Add tax registration"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={submit.pending}>
            Cancel
          </Button>
          <Button type="submit" form="tax-registration-form" loading={submit.pending}>
            {current ? "Save" : "Create"}
          </Button>
        </>
      }
    >
      <form
        id="tax-registration-form"
        onSubmit={(e) => void onSubmit(e)}
        className="flex flex-col gap-3"
      >
        {submit.error && <Alert variant="error">{submit.error}</Alert>}
        <FormField id="reg-country" label="Country" error={submit.fieldErrors.countryCode}>
          <Select
            id="reg-country"
            value={countryCode}
            onChange={(e) => onCountryChange(e.target.value)}
            required
            autoFocus
          >
            <option value="">Select a country</option>
            {countries.map((c) => (
              <option key={c.countryCode} value={c.countryCode}>
                {c.name} ({c.countryCode})
              </option>
            ))}
          </Select>
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField
            id="reg-type"
            label="Registration type"
            hint='e.g. "vat", "sales_tax", "gst"'
            error={submit.fieldErrors.registrationType}
          >
            <Input
              id="reg-type"
              value={registrationType}
              onChange={(e) => setRegistrationType(e.target.value)}
              required
              maxLength={80}
            />
          </FormField>
          <FormField id="reg-region" label="Region (optional)" hint="e.g. a US state code">
            <Input
              id="reg-region"
              value={regionCode}
              onChange={(e) => setRegionCode(e.target.value)}
              maxLength={10}
            />
          </FormField>
        </div>
        <FormField id="reg-number" label="Registration number (optional)">
          <Input
            id="reg-number"
            value={registrationNumber}
            onChange={(e) => setRegistrationNumber(e.target.value)}
            maxLength={80}
          />
        </FormField>
        <FormField id="reg-status" label="Status">
          <Select
            id="reg-status"
            value={status}
            onChange={(e) => setStatus(e.target.value as TaxRegistrationStatus)}
          >
            {TAX_REGISTRATION_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField id="reg-notes" label="Notes (optional)">
          <Textarea
            id="reg-notes"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={2000}
          />
        </FormField>
      </form>
    </Dialog>
  );
}

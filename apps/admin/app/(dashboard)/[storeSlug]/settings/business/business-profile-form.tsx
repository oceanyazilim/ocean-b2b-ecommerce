"use client";

import type {
  CountryProfileDetail,
  CountryProfileSummary,
  OrganizationBusinessProfile,
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
  Select,
  Skeleton,
} from "@ocean/ui";
import { useCallback, useEffect, useState } from "react";

import {
  AddressSchemaForm,
  validateAddressField,
  type AddressFormValues,
} from "@/components/address-schema-form";
import { SchemaForm, validateSchemaField, type SchemaFormValues } from "@/components/schema-form";
import { api, errorMessage } from "@/lib/api";
import { useSubmit } from "@/lib/use-submit";

// Merchant business-profile onboarding (spec sections 11/12/17-19): select a country, pick how
// the business is registered from THAT country's real entity-type list, then fill in the
// business-profile and address forms that country's CountryProfile defines. Every bit of
// country-specific behavior — which entity types exist, which fields appear, which are required,
// which formats are validated — comes from the CountryProfileDetail fetched below. This component
// never checks `countryCode === "TR"` or similar; SchemaForm/AddressSchemaForm render whatever the
// fetched schema says, for any country the platform ever adds.
export function BusinessProfileForm({
  organizationId,
  organizationName,
  editable,
}: {
  organizationId: string;
  organizationName: string;
  editable: boolean;
}) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [countries, setCountries] = useState<CountryProfileSummary[]>([]);
  const [saved, setSaved] = useState<OrganizationBusinessProfile | null>(null);

  const [countryCode, setCountryCode] = useState<string>("");
  const [country, setCountry] = useState<CountryProfileDetail | null>(null);
  const [countryLoading, setCountryLoading] = useState(false);
  const [entityType, setEntityType] = useState<string>("");
  const [profileValues, setProfileValues] = useState<SchemaFormValues>({});
  const [addressValues, setAddressValues] = useState<AddressFormValues>({});
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});
  const [pendingCountryCode, setPendingCountryCode] = useState<string | null>(null);
  const [savedBanner, setSavedBanner] = useState(false);

  const { pending, error: submitError, fieldErrors: serverFieldErrors, run } = useSubmit();

  const loadCountry = useCallback(async (code: string) => {
    if (!code) {
      setCountry(null);
      return;
    }
    setCountryLoading(true);
    try {
      const res = await api<{ data: CountryProfileDetail }>(`/countries/${code}`);
      setCountry(res.data);
    } catch (error) {
      setLoadError(errorMessage(error));
    } finally {
      setCountryLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setLoadError(null);
      try {
        const [countryList, profile] = await Promise.all([
          api<{ data: CountryProfileSummary[] }>("/countries"),
          api<{ data: OrganizationBusinessProfile }>(
            `/organizations/${organizationId}/business-profile`,
          ),
        ]);
        if (cancelled) return;
        setCountries(countryList.data);
        setSaved(profile.data);
        setCountryCode(profile.data.countryCode ?? "");
        setEntityType(profile.data.businessEntityType ?? "");
        setProfileValues(profile.data.businessProfile as SchemaFormValues);
        setAddressValues(profile.data.businessAddress as unknown as AddressFormValues);
        if (profile.data.countryCode) await loadCountry(profile.data.countryCode);
      } catch (error) {
        if (!cancelled) setLoadError(errorMessage(error));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
    // Intentionally run once on mount; loadCountry is stable via useCallback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId]);

  const hasEnteredData =
    entityType !== "" || Object.values(profileValues).some(Boolean) || Object.values(addressValues).some(Boolean);

  function onCountrySelect(nextCode: string) {
    setSavedBanner(false);
    if (countryCode && countryCode !== nextCode && hasEnteredData) {
      setPendingCountryCode(nextCode);
      return;
    }
    applyCountryChange(nextCode);
  }

  function applyCountryChange(nextCode: string) {
    setCountryCode(nextCode);
    setEntityType("");
    setProfileValues({});
    setAddressValues({});
    setClientErrors({});
    void loadCountry(nextCode);
  }

  function onEntityTypeChange(next: string) {
    setSavedBanner(false);
    setEntityType(next);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSavedBanner(false);
    if (!country) return;

    const errors: Record<string, string> = {};
    if (!entityType) {
      errors["businessEntityType"] = "Select how your business is registered";
    }
    for (const field of country.businessProfileSchema) {
      const visible =
        !field.visibilityRules?.entityTypeIn ||
        field.visibilityRules.entityTypeIn.length === 0 ||
        field.visibilityRules.entityTypeIn.includes(entityType);
      if (!visible) continue;
      const message = validateSchemaField(field, profileValues[field.key]);
      if (message) errors[`businessProfile.${field.key}`] = message;
    }
    for (const field of country.addressSchema) {
      const message = validateAddressField(field, addressValues[field.key]);
      if (message) errors[`businessAddress.${field.key}`] = message;
    }
    setClientErrors(errors);
    if (Object.keys(errors).length > 0) return;

    const res = await run(() =>
      api<{ data: OrganizationBusinessProfile }>(`/organizations/${organizationId}/business-profile`, {
        method: "PUT",
        body: {
          countryCode: country.countryCode,
          businessEntityType: entityType,
          businessProfile: profileValues,
          businessAddress: addressValues,
        },
      }),
    );
    if (res) {
      setSaved(res.data);
      setSavedBanner(true);
    }
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Business information</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (loadError) {
    return <Alert variant="error">{loadError}</Alert>;
  }

  const businessErrors = extractErrors(
    { ...clientErrors, ...serverFieldErrors },
    "businessProfile.",
  );
  const addressErrors = extractErrors(
    { ...clientErrors, ...serverFieldErrors },
    "businessAddress.",
  );
  const entityTypeError = clientErrors["businessEntityType"] ?? serverFieldErrors["businessEntityType"];

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Business information</CardTitle>
          <CardDescription>
            {organizationName}&rsquo;s legal business details, adapted to the requirements of the
            country it is registered in.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {submitError && <Alert variant="error">{submitError}</Alert>}
          {savedBanner && <Alert variant="success">Business information saved.</Alert>}
          {!editable && (
            <Alert variant="info">You can view this information but not change it.</Alert>
          )}
          {saved?.businessProfileCompletedAt && (
            <p className="text-xs text-muted-foreground">
              Last saved {new Date(saved.businessProfileCompletedAt).toLocaleString()}
            </p>
          )}

          <form onSubmit={onSubmit} className="flex flex-col gap-6" noValidate>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField id="business-country" label="Where is your business registered?">
                <Select
                  id="business-country"
                  value={countryCode}
                  onChange={(e) => onCountrySelect(e.target.value)}
                  disabled={!editable}
                >
                  <option value="">Select a country...</option>
                  {countries.map((c) => (
                    <option key={c.countryCode} value={c.countryCode}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField
                id="business-entity-type"
                label="How are you operating?"
                error={entityTypeError}
              >
                <Select
                  id="business-entity-type"
                  value={entityType}
                  onChange={(e) => onEntityTypeChange(e.target.value)}
                  disabled={!editable || !country || countryLoading}
                  invalid={!!entityTypeError}
                >
                  <option value="">
                    {country ? "Select..." : "Select a country first"}
                  </option>
                  {(country?.businessEntityTypes ?? []).map((t) => (
                    <option key={t.code} value={t.code}>
                      {t.label}
                    </option>
                  ))}
                </Select>
              </FormField>
            </div>

            {country && entityType && (
              <>
                <div>
                  <h3 className="mb-3 text-sm font-semibold">Business details</h3>
                  <SchemaForm
                    fields={country.businessProfileSchema}
                    entityType={entityType}
                    values={profileValues}
                    onChange={setProfileValues}
                    errors={businessErrors}
                    readOnly={!editable}
                  />
                </div>
                <div>
                  <h3 className="mb-3 text-sm font-semibold">Business address</h3>
                  <AddressSchemaForm
                    fields={country.addressSchema}
                    values={addressValues}
                    onChange={setAddressValues}
                    errors={addressErrors}
                    readOnly={!editable}
                  />
                </div>
              </>
            )}

            {country && !entityType && (
              <Alert variant="info">
                Choose how your business operates to see the required {country.name} fields.
              </Alert>
            )}

            {editable && country && entityType && (
              <div>
                <Button type="submit" loading={pending}>
                  Save business information
                </Button>
              </div>
            )}
          </form>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={pendingCountryCode !== null}
        onClose={() => setPendingCountryCode(null)}
        onConfirm={() => {
          const next = pendingCountryCode;
          setPendingCountryCode(null);
          if (next !== null) applyCountryChange(next);
        }}
        title="Change business country?"
        description="Switching countries clears the business type and answers you've entered, since they may not apply in the new country. This does not affect what's already saved until you submit."
        confirmLabel="Change country"
      />
    </div>
  );
}

function extractErrors(errors: Record<string, string>, prefix: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [path, message] of Object.entries(errors)) {
    if (path.startsWith(prefix)) out[path.slice(prefix.length)] = message;
  }
  return out;
}

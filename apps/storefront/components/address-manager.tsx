"use client";

import type { Address, CustomerAddressSummary } from "@ocean/types";
import { formatAddressLines } from "@ocean/types";
import { Badge, Button } from "@ocean/ui";
import { useState, type FormEvent } from "react";

import { api, errorMessage } from "@/lib/client-api";

const EMPTY_ADDRESS: Address = {
  firstName: "",
  lastName: "",
  company: "",
  address1: "",
  address2: "",
  city: "",
  province: "",
  provinceCode: "",
  countryCode: "TR",
  zip: "",
  phone: "",
};

export function AddressManager({ initialAddresses }: { initialAddresses: CustomerAddressSummary[] }) {
  const [addresses, setAddresses] = useState(initialAddresses);
  const [form, setForm] = useState<Address>(EMPTY_ADDRESS);
  const [showForm, setShowForm] = useState(initialAddresses.length === 0);
  const [pending, setPending] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function field(key: keyof Address) {
    return {
      value: form[key] ?? "",
      onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [key]: e.target.value })),
    };
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const updated = await api<{ data: CustomerAddressSummary[] }>("/account/addresses", {
        body: { address: form, isDefaultShipping: false, isDefaultBilling: false },
      });
      setAddresses(updated.data);
      setForm(EMPTY_ADDRESS);
      setShowForm(false);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  async function onRemove(id: string) {
    if (!confirm("Remove this address?")) return;
    setBusyId(id);
    setError(null);
    try {
      const updated = await api<{ data: CustomerAddressSummary[] }>(`/account/addresses/${id}`, {
        method: "DELETE",
      });
      setAddresses(updated.data);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  async function onMakeDefault(id: string, kind: "isDefaultShipping" | "isDefaultBilling") {
    setBusyId(id);
    setError(null);
    try {
      const updated = await api<{ data: CustomerAddressSummary[] }>(`/account/addresses/${id}`, {
        method: "PATCH",
        body: { [kind]: true },
      });
      setAddresses(updated.data);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="grid gap-4 sm:grid-cols-2">
        {addresses.map((entry) => (
          <div key={entry.id} className="flex flex-col gap-3 rounded-lg border p-4 text-sm">
            <div className="flex flex-wrap gap-1.5">
              {entry.isDefaultShipping && <Badge variant="secondary">Default shipping</Badge>}
              {entry.isDefaultBilling && <Badge variant="secondary">Default billing</Badge>}
            </div>
            <div className="text-muted-foreground">
              {formatAddressLines(entry.address).map((line, i) => (
                <p key={i}>{line}</p>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {!entry.isDefaultShipping && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busyId === entry.id}
                  onClick={() => void onMakeDefault(entry.id, "isDefaultShipping")}
                >
                  Make default shipping
                </Button>
              )}
              {!entry.isDefaultBilling && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busyId === entry.id}
                  onClick={() => void onMakeDefault(entry.id, "isDefaultBilling")}
                >
                  Make default billing
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                disabled={busyId === entry.id}
                onClick={() => void onRemove(entry.id)}
              >
                Remove
              </Button>
            </div>
          </div>
        ))}
      </div>

      {showForm ? (
        <form onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-3 rounded-lg border p-4 sm:max-w-md">
          <h2 className="text-sm font-semibold">Add an address</h2>
          <div className="flex gap-3">
            <input placeholder="First name" {...field("firstName")} className="h-9 w-1/2 rounded-md border border-input bg-background px-3 text-sm" />
            <input placeholder="Last name" {...field("lastName")} className="h-9 w-1/2 rounded-md border border-input bg-background px-3 text-sm" />
          </div>
          <input placeholder="Company (optional)" {...field("company")} className="h-9 rounded-md border border-input bg-background px-3 text-sm" />
          <input required placeholder="Address" {...field("address1")} className="h-9 rounded-md border border-input bg-background px-3 text-sm" />
          <input placeholder="Apartment, suite, etc. (optional)" {...field("address2")} className="h-9 rounded-md border border-input bg-background px-3 text-sm" />
          <div className="flex gap-3">
            <input required placeholder="City" {...field("city")} className="h-9 w-1/2 rounded-md border border-input bg-background px-3 text-sm" />
            <input placeholder="Postal code" {...field("zip")} className="h-9 w-1/2 rounded-md border border-input bg-background px-3 text-sm" />
          </div>
          <div className="flex gap-3">
            <input placeholder="Province/state" {...field("province")} className="h-9 w-1/2 rounded-md border border-input bg-background px-3 text-sm" />
            <input required placeholder="Country code (e.g. TR)" {...field("countryCode")} className="h-9 w-1/2 rounded-md border border-input bg-background px-3 text-sm" />
          </div>
          <input placeholder="Phone (optional)" {...field("phone")} className="h-9 rounded-md border border-input bg-background px-3 text-sm" />
          <div className="flex gap-2">
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save address"}
            </Button>
            {addresses.length > 0 && (
              <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>
                Cancel
              </Button>
            )}
          </div>
        </form>
      ) : (
        <Button variant="outline" className="self-start" onClick={() => setShowForm(true)}>
          Add address
        </Button>
      )}
    </div>
  );
}

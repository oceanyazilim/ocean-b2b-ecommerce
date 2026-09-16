"use client";

import type { AssignmentSummary, CompanyCandidate } from "@ocean/types";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Dialog,
} from "@ocean/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

import { api } from "@/lib/api";
import { useSubmit } from "@/lib/use-submit";

import { CompanyPicker, LocationSelect } from "./pickers";

// Who a catalog or price list applies to. `endpoint` is the collection URL, e.g.
// /stores/:id/catalogs/:catalogId/assignments.
export function AssignmentsCard({
  storeId,
  storeSlug,
  endpoint,
  assignments,
  canWrite,
  description,
}: {
  storeId: string;
  storeSlug: string;
  endpoint: string;
  assignments: AssignmentSummary[];
  canWrite: boolean;
  description: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const action = useSubmit();

  async function remove(id: string) {
    setBusyId(id);
    const ok = await action.run(() => api(`${endpoint}/${id}`, { method: "DELETE" }));
    setBusyId(null);
    if (ok !== undefined) router.refresh();
  }

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
        <div>
          <CardTitle>Assigned to</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        {canWrite && (
          <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
            Assign
          </Button>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {action.error && <Alert variant="error">{action.error}</Alert>}
        {assignments.length === 0 && (
          <p className="text-sm text-muted-foreground">Not assigned to any company yet.</p>
        )}
        {assignments.map((a) => (
          <div
            key={a.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm"
          >
            <div className="flex items-center gap-2">
              <Link
                href={`/${storeSlug}/companies/${a.company?.id ?? a.location?.companyId}`}
                className="font-medium hover:underline"
              >
                {a.company?.displayName ?? a.location?.companyName}
              </Link>
              {a.location ? (
                <Badge variant="secondary">{a.location.name}</Badge>
              ) : (
                <Badge variant="outline">All locations</Badge>
              )}
            </div>
            {canWrite && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                loading={busyId === a.id}
                onClick={() => void remove(a.id)}
              >
                Remove
              </Button>
            )}
          </div>
        ))}
      </CardContent>
      <AssignDialog
        storeId={storeId}
        endpoint={endpoint}
        open={open}
        onClose={() => setOpen(false)}
        onSaved={() => router.refresh()}
      />
    </Card>
  );
}

function AssignDialog({
  storeId,
  endpoint,
  open,
  onClose,
  onSaved,
}: {
  storeId: string;
  endpoint: string;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const submit = useSubmit();
  const { reset } = submit;
  const [company, setCompany] = useState<CompanyCandidate | null>(null);
  const [locationId, setLocationId] = useState("");

  useEffect(() => {
    reset();
    setCompany(null);
    setLocationId("");
  }, [open, reset]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!company) return;
    const body = locationId ? { companyLocationId: locationId } : { companyId: company.id };
    const res = await submit.run(() => api(endpoint, { body }));
    if (res !== undefined) {
      onSaved();
      onClose();
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Assign to a company"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={submit.pending}>
            Cancel
          </Button>
          <Button type="submit" form="assign-form" loading={submit.pending} disabled={!company}>
            Assign
          </Button>
        </>
      }
    >
      <form id="assign-form" onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-3">
        {submit.error && <Alert variant="error">{submit.error}</Alert>}
        <CompanyPicker
          storeId={storeId}
          value={company}
          onChange={(c) => {
            setCompany(c);
            setLocationId("");
          }}
          error={submit.fieldErrors.companyId}
        />
        <LocationSelect
          storeId={storeId}
          companyId={company?.id ?? null}
          value={locationId}
          onChange={setLocationId}
          hint="Leave blank to cover every location of the company."
        />
      </form>
    </Dialog>
  );
}

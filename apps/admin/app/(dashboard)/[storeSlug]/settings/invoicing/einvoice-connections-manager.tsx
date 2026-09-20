"use client";

import type {
  EInvoiceConnectionStatus,
  EInvoiceConnectionSummary,
  EInvoiceProviderCategory,
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
  Dialog,
  FormField,
  Input,
} from "@ocean/ui";
import { useEffect, useState, type FormEvent } from "react";

import { api } from "@/lib/api";
import { useSubmit } from "@/lib/use-submit";

const CATEGORY_LABEL: Record<EInvoiceProviderCategory, string> = {
  electronic_invoice_provider: "Electronic invoice provider",
  government_tax_platform: "Government tax platform integration",
  certified_third_party: "Certified third-party provider",
  accounting_platform: "Accounting platform",
};

const STATUS_VARIANT: Record<EInvoiceConnectionStatus, BadgeVariant> = {
  connected: "success",
  action_required: "warning",
  disconnected: "secondary",
};

const STATUS_LABEL: Record<EInvoiceConnectionStatus, string> = {
  connected: "Connected",
  action_required: "Action required",
  disconnected: "Disconnected",
};

// Finance -> Invoicing -> E-invoicing (spec section 29). A real config surface — provider
// category, status, connected-at — never a live integration. Status is always computed
// server-side from whether an account identifier and a credential were actually supplied (see
// EInvoiceConnectionsService); nothing here calls a real e-Fatura/government/accounting-platform
// API, so an unconfigured category honestly reads "Disconnected", same precedent as Phase 7's
// manual payment adapter.
export function EInvoiceConnectionsManager({
  storeId,
  initial,
  canWrite,
}: {
  storeId: string;
  initial: EInvoiceConnectionSummary[];
  canWrite: boolean;
}) {
  const [connections, setConnections] = useState(initial);
  const [editing, setEditing] = useState<EInvoiceConnectionSummary | null>(null);

  function upsert(next: EInvoiceConnectionSummary) {
    setConnections((prev) => prev.map((c) => (c.category === next.category ? next : c)));
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Conceptual configuration for each category of e-invoicing integration. No category here
        calls a real external service — connecting one just stores your account identifier and
        credential and reports status honestly based on what has actually been filled in.
      </p>
      {connections.map((conn) => (
        <Card key={conn.category}>
          <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
            <div>
              <CardTitle className="text-base">{CATEGORY_LABEL[conn.category]}</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                {conn.providerName || "No provider configured yet"}
                {conn.accountIdentifier && ` · ${conn.accountIdentifier}`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={STATUS_VARIANT[conn.status]}>{STATUS_LABEL[conn.status]}</Badge>
              {canWrite && (
                <Button size="sm" variant="outline" onClick={() => setEditing(conn)}>
                  {conn.providerName ? "Edit" : "Configure"}
                </Button>
              )}
            </div>
          </CardHeader>
          {conn.statusDetail && (
            <CardContent className="pt-0">
              <Alert variant="warning">{conn.statusDetail}</Alert>
            </CardContent>
          )}
        </Card>
      ))}
      <ConnectionDialog
        storeId={storeId}
        editing={editing}
        onClose={() => setEditing(null)}
        onSaved={upsert}
      />
    </div>
  );
}

function ConnectionDialog({
  storeId,
  editing,
  onClose,
  onSaved,
}: {
  storeId: string;
  editing: EInvoiceConnectionSummary | null;
  onClose: () => void;
  onSaved: (conn: EInvoiceConnectionSummary) => void;
}) {
  const submit = useSubmit();
  const { reset } = submit;
  const [providerName, setProviderName] = useState(editing?.providerName ?? "");
  const [accountIdentifier, setAccountIdentifier] = useState(editing?.accountIdentifier ?? "");
  const [credential, setCredential] = useState("");

  // Re-seed the form whenever a different connection is opened.
  useEffect(() => {
    reset();
    setProviderName(editing?.providerName ?? "");
    setAccountIdentifier(editing?.accountIdentifier ?? "");
    setCredential("");
  }, [editing, reset]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!editing) return;
    const body: {
      category: EInvoiceProviderCategory;
      providerName: string;
      accountIdentifier: string | null;
      credential?: string;
    } = {
      category: editing.category,
      providerName,
      accountIdentifier: accountIdentifier.trim() || null,
    };
    // Omitted entirely (not sent as null) when left blank, so the backend leaves any
    // already-stored credential state alone instead of treating a blank field as "clear it" —
    // see EInvoiceConnectionsService.upsert.
    if (credential.trim()) body.credential = credential.trim();
    const res = await submit.run(() =>
      api<{ data: EInvoiceConnectionSummary }>(`/stores/${storeId}/invoicing/connections`, {
        method: "PUT",
        body,
      }),
    );
    if (res) {
      onSaved(res.data);
      onClose();
    }
  }

  return (
    <Dialog
      open={editing !== null}
      onClose={onClose}
      title={editing ? CATEGORY_LABEL[editing.category] : ""}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={submit.pending}>
            Cancel
          </Button>
          <Button type="submit" form="einvoice-connection-form" loading={submit.pending}>
            Save
          </Button>
        </>
      }
    >
      <form
        id="einvoice-connection-form"
        onSubmit={(e) => void onSubmit(e)}
        className="flex flex-col gap-3"
      >
        {submit.error && <Alert variant="error">{submit.error}</Alert>}
        <p className="text-sm text-muted-foreground">
          Filling in both fields marks this connection Connected; filling in only one marks it
          Action required. Nothing is sent to a real external provider.
        </p>
        <FormField id="econn-provider" label="Provider name" error={submit.fieldErrors.providerName}>
          <Input
            id="econn-provider"
            value={providerName}
            onChange={(e) => setProviderName(e.target.value)}
            placeholder='e.g. "e-Fatura (GİB)", "QuickBooks Online"'
            required
            autoFocus
            maxLength={120}
          />
        </FormField>
        <FormField
          id="econn-account"
          label="Account / tax-office identifier"
          error={submit.fieldErrors.accountIdentifier}
        >
          <Input
            id="econn-account"
            value={accountIdentifier}
            onChange={(e) => setAccountIdentifier(e.target.value)}
            maxLength={120}
          />
        </FormField>
        <FormField
          id="econn-credential"
          label="API credential"
          hint={
            editing?.hasCredential
              ? "A credential is already stored — leave blank to keep it."
              : "Stored only long enough to compute status; never re-displayed."
          }
        >
          <Input
            id="econn-credential"
            type="password"
            value={credential}
            onChange={(e) => setCredential(e.target.value)}
            maxLength={500}
          />
        </FormField>
      </form>
    </Dialog>
  );
}

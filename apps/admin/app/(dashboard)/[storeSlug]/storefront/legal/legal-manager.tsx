"use client";

import type { LegalRequirementStatus, MarketLegalStatus, PageSummary } from "@ocean/types";
import { Alert, Badge, Button, Dialog, FormField, Input, Select, Textarea } from "@ocean/ui";
import { useCallback, useEffect, useState, type FormEvent } from "react";

import { api, errorMessage } from "@/lib/api";
import { useSubmit } from "@/lib/use-submit";

interface PageDetail extends PageSummary {
  bodyRich?: { html?: string } | null;
}

type Editing = {
  marketName: string;
  countryCode: string;
  requirement: LegalRequirementStatus;
} | null;

// L6 Global Localization (spec section 46): per active market, which conventional legal pages
// that market's country expects, and whether this store has created a real Page for each yet.
// Creating/editing reuses the existing Page CRUD (POST/PATCH /stores/:storeId/pages) — there is
// no parallel "legal page" content system.
export function LegalManager({ storeId, canWrite }: { storeId: string; canWrite: boolean }) {
  const [markets, setMarkets] = useState<MarketLegalStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await api<{ data: MarketLegalStatus[] }>(`/stores/${storeId}/legal/status`);
      setMarkets(res.data);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  if (markets.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        {error && <Alert variant="error">{error}</Alert>}
        <Alert variant="warning">
          No active markets yet. Add one under Storefront → Markets to see which legal pages it
          conventionally needs.
        </Alert>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-muted-foreground">
        Each active market&apos;s country has its own conventional set of legal pages — driven by
        configuration, not a fixed global list. Create a real page for anything still missing.
      </p>
      {error && <Alert variant="error">{error}</Alert>}
      {markets.map((market) => (
        <div key={market.marketId} className="rounded-lg border">
          <div className="flex items-center justify-between gap-3 border-b bg-canvas px-4 py-3">
            <div>
              <p className="text-sm font-semibold">{market.marketName}</p>
              <p className="text-xs text-muted-foreground">{market.countryCode}</p>
            </div>
          </div>
          {market.requirements.length === 0 ? (
            <p className="px-4 py-4 text-sm text-muted-foreground">
              No conventional legal pages are configured for {market.countryCode} yet.
            </p>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {market.requirements.map((req) => (
                  <tr key={req.code} className="border-b last:border-b-0">
                    <td className="px-4 py-3">
                      <p className="font-medium">{req.label}</p>
                      {req.description && (
                        <p className="text-xs text-muted-foreground">{req.description}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <Badge variant={req.isRequired ? "secondary" : "outline"}>
                        {req.isRequired ? "Required" : "Recommended"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <Badge variant={req.status === "created" ? "success" : "warning"}>
                        {req.status === "created" ? "Created" : "Missing"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right align-top">
                      {canWrite && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            setEditing({
                              marketName: market.marketName,
                              countryCode: market.countryCode,
                              requirement: req,
                            })
                          }
                        >
                          {req.status === "created" ? "Edit" : "Create"}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ))}
      <LegalPageDialog
        storeId={storeId}
        editing={editing}
        onClose={() => setEditing(null)}
        onSaved={() => void load()}
      />
    </div>
  );
}

function LegalPageDialog({
  storeId,
  editing,
  onClose,
  onSaved,
}: {
  storeId: string;
  editing: Editing;
  onClose: () => void;
  onSaved: () => void;
}) {
  const submit = useSubmit();
  const { reset } = submit;
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [title, setTitle] = useState("");
  const [handle, setHandle] = useState("");
  const [html, setHtml] = useState("");
  const [status, setStatus] = useState<PageSummary["status"]>("draft");
  const existingPageId = editing?.requirement.page?.id ?? null;

  useEffect(() => {
    if (!editing) return;
    reset();
    const { requirement } = editing;
    if (requirement.page) {
      setLoadingDetail(true);
      api<{ data: PageDetail }>(`/stores/${storeId}/pages/${requirement.page.id}`)
        .then(({ data: detail }) => {
          setTitle(detail.title);
          setHandle(detail.handle);
          setHtml(detail.bodyRich?.html ?? "");
          setStatus(detail.status);
        })
        .catch(() => reset())
        .finally(() => setLoadingDetail(false));
    } else {
      setTitle(requirement.label);
      setHandle(
        requirement.code
          .replace(/_/g, "-")
          .replace(/[^a-z0-9-]/gi, "")
          .toLowerCase(),
      );
      setHtml("");
      setStatus("draft");
    }
  }, [editing, storeId, reset]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!editing) return;
    const body = {
      title,
      handle,
      bodyRich: { html },
      status,
      legalRequirementCode: editing.requirement.code,
    };
    const res = await submit.run(() =>
      existingPageId
        ? api(`/stores/${storeId}/pages/${existingPageId}`, { method: "PATCH", body })
        : api(`/stores/${storeId}/pages`, { body }),
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
      title={
        editing
          ? `${existingPageId ? "Edit" : "Create"} ${editing.requirement.label} — ${editing.marketName}`
          : ""
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={submit.pending}>
            Cancel
          </Button>
          <Button type="submit" form="legal-page-form" loading={submit.pending} disabled={loadingDetail}>
            {existingPageId ? "Save" : "Create"}
          </Button>
        </>
      }
    >
      <form id="legal-page-form" onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-3">
        {submit.error && <Alert variant="error">{submit.error}</Alert>}
        <FormField id="legal-page-title" label="Title" error={submit.fieldErrors.title}>
          <Input id="legal-page-title" value={title} onChange={(e) => setTitle(e.target.value)} required autoFocus />
        </FormField>
        <FormField id="legal-page-handle" label="Handle" error={submit.fieldErrors.handle}>
          <Input id="legal-page-handle" value={handle} onChange={(e) => setHandle(e.target.value)} required />
        </FormField>
        <FormField id="legal-page-status" label="Status">
          <Select id="legal-page-status" value={status} onChange={(e) => setStatus(e.target.value as PageSummary["status"])}>
            <option value="draft">Draft</option>
            <option value="published">Published</option>
            <option value="archived">Archived</option>
          </Select>
        </FormField>
        <FormField id="legal-page-body" label="Content (HTML)">
          <Textarea id="legal-page-body" value={html} onChange={(e) => setHtml(e.target.value)} rows={10} />
        </FormField>
      </form>
    </Dialog>
  );
}

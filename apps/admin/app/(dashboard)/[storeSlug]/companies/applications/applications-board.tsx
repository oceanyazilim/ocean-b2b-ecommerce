"use client";

import {
  formatAddressLines,
  type AccountManagerCandidate,
  type CompanyApplicationStatus,
  type CompanyApplicationSummary,
  type CompanyStats,
  type Paginated,
} from "@ocean/types";
import {
  Alert,
  Badge,
  Button,
  DataGrid,
  Dialog,
  FormField,
  Input,
  Select,
  Tabs,
  Textarea,
  type DataGridColumn,
} from "@ocean/ui";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";

import {
  AddressFields,
  addressToDraft,
  draftToAddress,
  isAddressBlank,
  type AddressDraft,
} from "@/components/address-fields";
import { api, errorMessage } from "@/lib/api";
import { useSubmit } from "@/lib/use-submit";

import { CompaniesNav } from "../company-nav";

type View = "open" | CompanyApplicationStatus;

const STATUS_BADGE: Record<CompanyApplicationStatus, "warning" | "secondary" | "success" | "destructive"> =
  {
    pending: "warning",
    under_review: "secondary",
    approved: "success",
    rejected: "destructive",
  };

export function ApplicationsBoard({
  storeId,
  storeSlug,
  managers,
  canWrite,
}: {
  storeId: string;
  storeSlug: string;
  managers: AccountManagerCandidate[];
  canWrite: boolean;
}) {
  const [view, setView] = useState<View>("open");
  const [q, setQ] = useState("");
  const [pages, setPages] = useState<CompanyApplicationSummary[][]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<CompanyStats | null>(null);
  const [selected, setSelected] = useState<CompanyApplicationSummary | null>(null);
  const base = `/stores/${storeId}/company-applications`;

  const load = useCallback(
    async (after: string | null, append: boolean) => {
      setLoading(!append);
      setError(null);
      try {
        const params = new URLSearchParams({ limit: "25" });
        if (view !== "open") params.set("status", view);
        if (q.trim()) params.set("q", q.trim());
        if (after) params.set("cursor", after);
        const [res, s] = await Promise.all([
          api<Paginated<CompanyApplicationSummary>>(`${base}?${params}`),
          append ? null : api<{ data: CompanyStats }>(`/stores/${storeId}/companies/stats`),
        ]);
        const data =
          view === "open"
            ? res.data.filter((a) => a.status === "pending" || a.status === "under_review")
            : res.data;
        setPages((prev) => (append ? [...prev, data] : [data]));
        setCursor(res.pageInfo.endCursor);
        setHasNext(res.pageInfo.hasNextPage);
        if (s) setStats(s.data);
      } catch (err) {
        setError(errorMessage(err));
      } finally {
        setLoading(false);
      }
    },
    [base, storeId, view, q],
  );

  useEffect(() => {
    const handle = setTimeout(() => void load(null, false), q ? 250 : 0);
    return () => clearTimeout(handle);
  }, [load, q]);

  const rows = useMemo(() => pages.flat(), [pages]);

  const columns: DataGridColumn<CompanyApplicationSummary>[] = [
    {
      key: "company",
      header: "Company",
      cell: (a) => (
        <div>
          <div className="font-medium">{a.legalName}</div>
          <div className="text-xs text-muted-foreground">
            {[a.taxNumber, a.industry].filter(Boolean).join(" · ") || "—"}
          </div>
        </div>
      ),
    },
    {
      key: "contact",
      header: "Contact",
      cell: (a) => (
        <div>
          <div>
            {a.contactFirstName} {a.contactLastName}
          </div>
          <div className="text-xs text-muted-foreground">{a.contactEmail}</div>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (a) => (
        <div className="flex flex-col gap-0.5">
          <Badge variant={STATUS_BADGE[a.status]}>{a.status.replace("_", " ")}</Badge>
          {a.reviewer && <span className="text-xs text-muted-foreground">{a.reviewer.name}</span>}
        </div>
      ),
    },
    {
      key: "documents",
      header: "Docs",
      className: "text-right",
      cell: (a) => <span className="tabular-nums">{a.documents.length}</span>,
    },
    {
      key: "created",
      header: "Submitted",
      cell: (a) => (
        <span className="text-muted-foreground">{new Date(a.createdAt).toLocaleDateString()}</span>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Companies</h1>
          <p className="text-sm text-muted-foreground">
            Wholesale account requests. Approving one creates the company, its head office and
            the contact as company admin.
          </p>
        </div>
      </div>
      <CompaniesNav storeSlug={storeSlug} pendingApplications={stats?.pendingApplications} />
      <Tabs
        aria-label="Filter applications"
        value={view}
        onChange={setView}
        items={[
          { value: "open", label: "Open", count: stats?.pendingApplications },
          { value: "approved", label: "Approved" },
          { value: "rejected", label: "Rejected" },
        ]}
      />
      <Input
        placeholder="Search by company, contact or tax number"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="max-w-md"
        aria-label="Search applications"
      />
      {error && <Alert variant="error">{error}</Alert>}
      <DataGrid
        columns={columns}
        rows={rows}
        rowKey={(a) => a.id}
        loading={loading}
        onRowClick={setSelected}
        empty={{
          title: view === "open" ? "No open applications" : "Nothing here",
          description:
            view === "open"
              ? "Applications from the storefront wholesale form land here for review."
              : "Try another filter.",
        }}
        pageInfo={{
          hasNextPage: hasNext,
          onNext: () => void load(cursor, true),
          onFirst: pages.length > 1 ? () => void load(null, false) : undefined,
        }}
      />
      <ApplicationDialog
        base={base}
        storeSlug={storeSlug}
        application={selected}
        managers={managers}
        canWrite={canWrite}
        onClose={() => setSelected(null)}
        onChanged={() => void load(null, false)}
      />
    </div>
  );
}

function ApplicationDialog({
  base,
  storeSlug,
  application,
  managers,
  canWrite,
  onClose,
  onChanged,
}: {
  base: string;
  storeSlug: string;
  application: CompanyApplicationSummary | null;
  managers: AccountManagerCandidate[];
  canWrite: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const submit = useSubmit();
  const { reset } = submit;
  const [mode, setMode] = useState<"view" | "approve" | "reject">("view");
  const [locationName, setLocationName] = useState("Head office");
  const [address, setAddress] = useState<AddressDraft>(addressToDraft(null));
  const [accountManagerId, setAccountManagerId] = useState("");
  const [note, setNote] = useState("");
  const [current, setCurrent] = useState<CompanyApplicationSummary | null>(application);

  useEffect(() => {
    reset();
    setCurrent(application);
    setMode("view");
    setLocationName("Head office");
    setAddress(addressToDraft(application?.address));
    setAccountManagerId("");
    setNote("");
  }, [application, reset]);

  const a = current;
  if (!a) return <Dialog open={false} onClose={onClose} title="" />;
  const applicationId = a.id;
  const open = a.status === "pending" || a.status === "under_review";

  async function act(fn: () => Promise<{ data: CompanyApplicationSummary }>) {
    const res = await submit.run(fn);
    if (res !== undefined) {
      setCurrent(res.data);
      setMode("view");
      onChanged();
    }
  }

  async function onApprove(e: FormEvent) {
    e.preventDefault();
    await act(() =>
      api<{ data: CompanyApplicationSummary }>(`${base}/${applicationId}/approve`, {
        body: {
          locationName: locationName.trim() || undefined,
          ...(isAddressBlank(address) ? {} : { address: draftToAddress(address) }),
          accountManagerId: accountManagerId || null,
          note: note.trim() || null,
        },
      }),
    );
  }

  async function onReject(e: FormEvent) {
    e.preventDefault();
    await act(() =>
      api<{ data: CompanyApplicationSummary }>(`${base}/${applicationId}/reject`, { body: { note } }),
    );
  }

  const row = (label: string, value: string | null | undefined) =>
    value ? (
      <div>
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd>{value}</dd>
      </div>
    ) : null;

  return (
    <Dialog
      open={application !== null}
      onClose={onClose}
      title={a.legalName}
      description={`${a.status.replace("_", " ")} · submitted ${new Date(a.createdAt).toLocaleString()}`}
      className="max-w-2xl"
      footer={
        mode === "view" ? (
          <>
            <Button variant="ghost" onClick={onClose}>
              Close
            </Button>
            {canWrite && open && (
              <>
                {a.status === "pending" && (
                  <Button
                    variant="outline"
                    loading={submit.pending}
                    onClick={() =>
                      void act(() =>
                        api<{ data: CompanyApplicationSummary }>(`${base}/${a.id}/review`, { body: {} }),
                      )
                    }
                  >
                    Start review
                  </Button>
                )}
                <Button variant="destructive" onClick={() => setMode("reject")}>
                  Reject
                </Button>
                <Button onClick={() => setMode("approve")}>Approve…</Button>
              </>
            )}
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={() => setMode("view")} disabled={submit.pending}>
              Back
            </Button>
            <Button
              type="submit"
              form="application-decision"
              loading={submit.pending}
              variant={mode === "reject" ? "destructive" : "primary"}
            >
              {mode === "reject" ? "Reject application" : "Approve and create company"}
            </Button>
          </>
        )
      }
    >
      <div className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto pr-1 text-sm">
        {submit.error && <Alert variant="error">{submit.error}</Alert>}

        {mode === "view" && (
          <>
            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {row("Display name", a.displayName)}
              {row("Tax number", a.taxNumber)}
              {row("Tax office", a.taxOffice)}
              {row("Industry", a.industry)}
              {row("Website", a.website)}
              {row("Expected monthly volume", a.expectedMonthlyVolume)}
              {row("Contact", `${a.contactFirstName} ${a.contactLastName}`)}
              {row("Email", a.contactEmail)}
              {row("Phone", a.contactPhone)}
              {row("Source", a.source)}
              {a.address && (
                <div className="sm:col-span-2">
                  <dt className="text-xs text-muted-foreground">Address</dt>
                  <dd>{formatAddressLines(a.address).join(", ")}</dd>
                </div>
              )}
              {a.message && (
                <div className="sm:col-span-2">
                  <dt className="text-xs text-muted-foreground">Message</dt>
                  <dd className="whitespace-pre-wrap">{a.message}</dd>
                </div>
              )}
            </dl>
            {a.documents.length > 0 && (
              <div>
                <div className="text-xs text-muted-foreground">Documents</div>
                <ul className="mt-1 flex flex-col gap-1">
                  {a.documents.map((d) => (
                    <li key={d.mediaId}>
                      <a href={d.url} target="_blank" rel="noreferrer" className="hover:underline">
                        {d.name}
                      </a>
                      <span className="ml-2 text-xs text-muted-foreground">{d.mime}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {a.status === "approved" && a.companyId && (
              <Alert variant="success">
                Approved{a.reviewer ? ` by ${a.reviewer.name}` : ""}.{" "}
                <Link href={`/${storeSlug}/companies/${a.companyId}`} className="underline">
                  Open the company
                </Link>
                .
              </Alert>
            )}
            {a.status === "rejected" && (
              <Alert variant="warning">
                Rejected{a.reviewer ? ` by ${a.reviewer.name}` : ""}: {a.decisionNote}
              </Alert>
            )}
          </>
        )}

        {mode === "approve" && (
          <form id="application-decision" onSubmit={(e) => void onApprove(e)} className="flex flex-col gap-3">
            <p className="text-muted-foreground">
              Creates <strong>{a.legalName}</strong> as an active company with {a.contactFirstName}{" "}
              {a.contactLastName} as company admin. Adjust the head office below if needed.
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FormField id="ap-loc" label="Head office name" error={submit.fieldErrors.locationName}>
                <Input id="ap-loc" value={locationName} onChange={(e) => setLocationName(e.target.value)} maxLength={120} />
              </FormField>
              <FormField id="ap-manager" label="Account manager" error={submit.fieldErrors.accountManagerId}>
                <Select id="ap-manager" value={accountManagerId} onChange={(e) => setAccountManagerId(e.target.value)}>
                  <option value="">Unassigned</option>
                  {managers.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </Select>
              </FormField>
            </div>
            <AddressFields
              idPrefix="ap-addr"
              value={address}
              onChange={setAddress}
              errors={submit.fieldErrors}
              prefix="address"
              showName={false}
            />
            <FormField id="ap-note" label="Internal note" error={submit.fieldErrors.note}>
              <Textarea id="ap-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} />
            </FormField>
          </form>
        )}

        {mode === "reject" && (
          <form id="application-decision" onSubmit={(e) => void onReject(e)} className="flex flex-col gap-3">
            <FormField
              id="rj-note"
              label="Reason"
              hint="Kept on the application and used in the notification to the applicant."
              error={submit.fieldErrors.note}
            >
              <Textarea
                id="rj-note"
                rows={4}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                required
                maxLength={2000}
                invalid={!!submit.fieldErrors.note}
                autoFocus
              />
            </FormField>
          </form>
        )}
      </div>
    </Dialog>
  );
}

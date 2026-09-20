"use client";

import type { ApprovalRuleSummary, ApprovalStatus, ApprovalSummary, CompanyCandidate } from "@ocean/types";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  ConfirmDialog,
  DataGrid,
  Dialog,
  FormField,
  Input,
  Select,
  TagInput,
  type DataGridColumn,
} from "@ocean/ui";
import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";

import { CompanyPicker } from "@/components/pickers";
import { api, errorMessage } from "@/lib/api";
import { inputToMinor } from "@/lib/money";
import { useSubmit } from "@/lib/use-submit";

const STATUS_VARIANT: Record<ApprovalStatus, "warning" | "success" | "destructive"> = {
  pending: "warning",
  approved: "success",
  rejected: "destructive",
};

export function ApprovalsManager({
  storeId,
  storeSlug,
  canWrite,
}: {
  storeId: string;
  storeSlug: string;
  canWrite: boolean;
}) {
  return (
    <div className="flex flex-col gap-8">
      <p className="text-sm text-muted-foreground">
        When an order matches a rule below, it&apos;s placed as{" "}
        <Badge variant="warning">pending approval</Badge> and waits here for someone with one of
        the rule&apos;s approver roles to decide before the order proceeds.
      </p>
      <PendingApprovals storeId={storeId} storeSlug={storeSlug} canWrite={canWrite} />
      <ApprovalRules storeId={storeId} canWrite={canWrite} />
    </div>
  );
}

function PendingApprovals({
  storeId,
  storeSlug,
  canWrite,
}: {
  storeId: string;
  storeSlug: string;
  canWrite: boolean;
}) {
  const [rows, setRows] = useState<ApprovalSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<ApprovalStatus | "">("pending");
  const action = useSubmit();
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const qs = status ? `?status=${status}` : "";
      const res = await api<{ data: ApprovalSummary[] }>(`/stores/${storeId}/approvals${qs}`);
      setRows(res.data);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [storeId, status]);

  useEffect(() => {
    void load();
  }, [load]);

  async function decide(id: string, action_: "approve" | "reject") {
    setBusyId(id);
    const ok = await action.run(() => api(`/stores/${storeId}/approvals/${id}/${action_}`, { method: "POST", body: {} }));
    setBusyId(null);
    if (ok !== undefined) await load();
  }

  const columns: DataGridColumn<ApprovalSummary>[] = [
    {
      key: "order",
      header: "Order",
      cell: (a) =>
        a.orderId ? (
          <Link href={`/${storeSlug}/orders/${a.orderId}`} className="font-medium hover:underline">
            {a.orderName ?? a.orderId}
          </Link>
        ) : (
          "—"
        ),
    },
    { key: "status", header: "Status", cell: (a) => <Badge variant={STATUS_VARIANT[a.status]}>{a.status}</Badge> },
    { key: "createdAt", header: "Requested", cell: (a) => new Date(a.createdAt).toLocaleString() },
    ...(canWrite
      ? [
          {
            key: "actions",
            header: "",
            className: "text-right",
            cell: (a: ApprovalSummary) =>
              a.status === "pending" ? (
                <div className="flex justify-end gap-1">
                  <Button size="sm" loading={busyId === a.id} onClick={() => void decide(a.id, "approve")}>
                    Approve
                  </Button>
                  <Button size="sm" variant="ghost" loading={busyId === a.id} onClick={() => void decide(a.id, "reject")}>
                    Reject
                  </Button>
                </div>
              ) : null,
          } satisfies DataGridColumn<ApprovalSummary>,
        ]
      : []),
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Pending approvals</h2>
        <Select value={status} onChange={(e) => setStatus(e.target.value as ApprovalStatus | "")} className="w-40">
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="">All</option>
        </Select>
      </div>
      {(error ?? action.error) && <Alert variant="error">{error ?? action.error}</Alert>}
      <DataGrid
        columns={columns}
        rows={rows}
        rowKey={(a) => a.id}
        loading={loading}
        empty={{ title: "Nothing to review", description: "Orders that match an approval rule land here." }}
      />
    </div>
  );
}

function ApprovalRules({ storeId, canWrite }: { storeId: string; canWrite: boolean }) {
  const [rules, setRules] = useState<ApprovalRuleSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<ApprovalRuleSummary | null>(null);
  const action = useSubmit();
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await api<{ data: ApprovalRuleSummary[] }>(`/stores/${storeId}/approval-rules`);
      setRules(res.data);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Approval rules</h2>
          <p className="text-sm text-muted-foreground">Orders over a threshold wait for one of these roles to approve.</p>
        </div>
        {canWrite && <Button onClick={() => setCreating(true)}>Add rule</Button>}
      </div>
      {error && <Alert variant="error">{error}</Alert>}
      {loading ? null : rules.length === 0 ? (
        <Card>
          <CardContent className="py-6 text-center text-sm text-muted-foreground">No rules yet.</CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {rules.map((r) => (
            <Card key={r.id}>
              <CardContent className="flex items-center justify-between py-3">
                <div className="text-sm">
                  <div className="font-medium">{r.companyId ? "Company-specific rule" : "Store-wide rule"}</div>
                  <div className="text-muted-foreground">
                    {r.conditions.minTotal !== undefined
                      ? `Orders over ${(r.conditions.minTotal / 100).toFixed(2)}`
                      : "Every order"}
                    {" · approvers: "}
                    {r.approverRoles.join(", ") || "none set"}
                  </div>
                </div>
                {canWrite && (
                  <Button size="sm" variant="ghost" onClick={() => setDeleting(r)}>
                    Delete
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      <CreateRuleDialog storeId={storeId} open={creating} onClose={() => setCreating(false)} onSaved={() => void load()} />
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title="Delete this approval rule?"
        destructive
        pending={busyId === deleting?.id}
        onConfirm={async () => {
          if (!deleting) return;
          setBusyId(deleting.id);
          const ok = await action.run(() => api(`/stores/${storeId}/approval-rules/${deleting.id}`, { method: "DELETE" }));
          setBusyId(null);
          if (ok !== undefined) await load();
          setDeleting(null);
        }}
      />
    </div>
  );
}

function CreateRuleDialog({
  storeId,
  open,
  onClose,
  onSaved,
}: {
  storeId: string;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const submit = useSubmit();
  const { reset } = submit;
  const [storeWide, setStoreWide] = useState(true);
  const [company, setCompany] = useState<CompanyCandidate | null>(null);
  const [minTotal, setMinTotal] = useState("");
  const [roles, setRoles] = useState<string[]>([]);

  useEffect(() => {
    if (open) {
      reset();
      setStoreWide(true);
      setCompany(null);
      setMinTotal("");
      setRoles([]);
    }
  }, [open, reset]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const body = {
      companyId: storeWide ? null : (company?.id ?? null),
      conditions: minTotal.trim() ? { minTotal: inputToMinor(minTotal) ?? 0 } : {},
      approverRoles: roles,
    };
    const res = await submit.run(() => api(`/stores/${storeId}/approval-rules`, { body }));
    if (res !== undefined) {
      onSaved();
      onClose();
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Add approval rule"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={submit.pending}>
            Cancel
          </Button>
          <Button type="submit" form="rule-form" loading={submit.pending}>
            Create
          </Button>
        </>
      }
    >
      <form id="rule-form" onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-3">
        {submit.error && <Alert variant="error">{submit.error}</Alert>}
        <div className="flex gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input type="radio" checked={storeWide} onChange={() => setStoreWide(true)} />
            Store-wide
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" checked={!storeWide} onChange={() => setStoreWide(false)} />
            One company
          </label>
        </div>
        {!storeWide && <CompanyPicker storeId={storeId} value={company} onChange={setCompany} />}
        <FormField id="rule-min-total" label="Minimum order total (blank = every order)">
          <Input id="rule-min-total" inputMode="decimal" value={minTotal} onChange={(e) => setMinTotal(e.target.value)} />
        </FormField>
        <FormField id="rule-roles" label="Approver roles">
          <TagInput id="rule-roles" value={roles} onChange={setRoles} />
        </FormField>
      </form>
    </Dialog>
  );
}

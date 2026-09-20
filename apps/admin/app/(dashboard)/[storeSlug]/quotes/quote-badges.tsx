import type { QuoteStatus } from "@ocean/types";
import { Badge, type BadgeVariant } from "@ocean/ui";

// Real enum from packages/types/src/b2b.ts (QUOTE_STATUSES) — mirrors the DB's QuoteStatus
// enum exactly. The spec's illustrative list (Draft/Sent/Viewed/Negotiating/Accepted/Rejected/
// Expired) includes "Viewed" and "Negotiating" states this codebase doesn't track, and uses
// "Rejected" where the real status is "declined" — badges below use only real values.
const QUOTE: Record<QuoteStatus, BadgeVariant> = {
  draft: "secondary",
  sent: "info",
  accepted: "success",
  declined: "destructive",
  expired: "warning",
  converted: "success",
};

const LABEL: Record<QuoteStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  accepted: "Accepted",
  declined: "Declined",
  expired: "Expired",
  converted: "Converted",
};

export function QuoteStatusBadge({ status }: { status: QuoteStatus }) {
  return <Badge variant={QUOTE[status]}>{LABEL[status]}</Badge>;
}

// Renders the quote's real `paymentTerms` JSON (shape this admin writes — see quote-editor.tsx)
// as a short human label. Falls back gracefully for quotes created before this field was
// exposed in the UI (empty object) or set by another client with a different shape.
export function formatPaymentTerms(terms: Record<string, unknown> | null | undefined): string {
  if (!terms || typeof terms !== "object" || Object.keys(terms).length === 0) return "Not set";
  const type = typeof terms.type === "string" ? terms.type : null;
  switch (type) {
    case "immediate":
      return "Due immediately";
    case "net": {
      const days = typeof terms.netDays === "number" ? terms.netDays : null;
      return days ? `Net ${days}` : "Net terms";
    }
    case "deposit": {
      const pct = typeof terms.depositPercent === "number" ? terms.depositPercent : null;
      const days = typeof terms.remainderNetDays === "number" ? terms.remainderNetDays : null;
      if (pct !== null && days !== null) return `${pct}% deposit · ${100 - pct}% Net ${days}`;
      if (pct !== null) return `${pct}% deposit`;
      return "Deposit required";
    }
    case "scheduled":
      return "Scheduled payments";
    default:
      return "Custom";
  }
}

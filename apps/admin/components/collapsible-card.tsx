"use client";

import { Card, CardContent, ChevronDownIcon, cn } from "@ocean/ui";
import { useState, type ReactNode } from "react";

// A Card whose body can be collapsed. Used on the product and customer detail pages so long
// editors (media, variants, SEO, metafields, timeline…) don't force endless scrolling — the
// primary sections stay open by default, secondary ones start collapsed.
//
// `headerExtra` (e.g. a "Copy price to all" button) sits next to — never inside — the toggle
// control, since nesting an interactive element inside a <button> is invalid HTML.
export function CollapsibleCard({
  title,
  description,
  defaultOpen = true,
  headerExtra,
  contentClassName,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  defaultOpen?: boolean;
  headerExtra?: ReactNode;
  contentClassName?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card>
      <div className="flex w-full items-center justify-between gap-3 p-5">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex min-w-0 flex-1 flex-col gap-1 text-left"
          aria-expanded={open}
        >
          <span className="text-base font-semibold leading-none tracking-tight">{title}</span>
          {description && <span className="text-sm text-muted-foreground">{description}</span>}
        </button>
        <div className="flex shrink-0 items-center gap-2">
          {headerExtra}
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-label={open ? "Collapse section" : "Expand section"}
            aria-expanded={open}
            className="text-muted-foreground hover:text-foreground"
          >
            <ChevronDownIcon className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
          </button>
        </div>
      </div>
      {open && <CardContent className={cn("pt-0", contentClassName)}>{children}</CardContent>}
    </Card>
  );
}

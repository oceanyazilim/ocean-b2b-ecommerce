"use client";

import type { ReactNode } from "react";

import { Button } from "./button";
import { Checkbox } from "./checkbox";
import { cn } from "./cn";
import { EmptyState } from "./empty-state";
import { Skeleton } from "./skeleton";

export interface DataGridColumn<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  className?: string;
  sortable?: boolean;
  width?: string;
}

export interface DataGridProps<T> {
  columns: DataGridColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  loading?: boolean;
  empty?: { title: string; description?: string; action?: ReactNode };
  selectable?: boolean;
  selected?: Set<string>;
  onSelectedChange?: (selected: Set<string>) => void;
  sort?: { key: string; direction: "asc" | "desc" } | null;
  onSortChange?: (key: string) => void;
  onRowClick?: (row: T) => void;
  bulkActions?: ReactNode;
  pageInfo?: {
    hasNextPage: boolean;
    onNext: () => void;
    onFirst?: (() => void) | undefined;
    loadingMore?: boolean | undefined;
  };
  className?: string | undefined;
}

// The one table every admin list screen uses: selection, sortable headers, bulk bar, cursor pager,
// loading skeletons and an empty state. Data fetching stays with the caller.
export function DataGrid<T>({
  columns,
  rows,
  rowKey,
  loading = false,
  empty,
  selectable = false,
  selected = new Set<string>(),
  onSelectedChange,
  sort,
  onSortChange,
  onRowClick,
  bulkActions,
  pageInfo,
  className,
}: DataGridProps<T>) {
  const allKeys = rows.map(rowKey);
  const allSelected = allKeys.length > 0 && allKeys.every((k) => selected.has(k));
  const someSelected = allKeys.some((k) => selected.has(k));

  function toggleAll() {
    if (!onSelectedChange) return;
    const next = new Set(selected);
    if (allSelected) allKeys.forEach((k) => next.delete(k));
    else allKeys.forEach((k) => next.add(k));
    onSelectedChange(next);
  }

  function toggle(key: string) {
    if (!onSelectedChange) return;
    const next = new Set(selected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onSelectedChange(next);
  }

  return (
    <div className={cn("overflow-hidden rounded-lg border bg-card shadow-card", className)}>
      {selectable && selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b bg-accent/70 px-4 py-2.5 text-sm">
          <span className="font-medium">{selected.size} selected</span>
          <div className="flex flex-wrap gap-2">{bulkActions}</div>
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto"
            onClick={() => onSelectedChange?.(new Set())}
          >
            Clear
          </Button>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <tr>
              {selectable && (
                <th className="w-10 px-4 py-2.5">
                  <Checkbox
                    aria-label="Select all"
                    checked={allSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = !allSelected && someSelected;
                    }}
                    onChange={toggleAll}
                  />
                </th>
              )}
              {columns.map((col) => {
                const active = sort?.key === col.key;
                return (
                  <th
                    key={col.key}
                    className={cn("px-4 py-2.5 font-semibold", col.className)}
                    style={col.width ? { width: col.width } : undefined}
                  >
                    {col.sortable && onSortChange ? (
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 hover:text-foreground"
                        onClick={() => onSortChange(col.key)}
                      >
                        {col.header}
                        <span aria-hidden className={cn("text-[10px]", !active && "opacity-30")}>
                          {active && sort?.direction === "desc" ? "▼" : "▲"}
                        </span>
                      </button>
                    ) : (
                      col.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading &&
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={`skeleton-${i}`}>
                  {selectable && <td className="px-4 py-3.5" />}
                  {columns.map((col) => (
                    <td key={col.key} className="px-4 py-3.5">
                      <Skeleton className="h-4 w-3/4" />
                    </td>
                  ))}
                </tr>
              ))}
            {!loading &&
              rows.map((row) => {
                const key = rowKey(row);
                const isSelected = selected.has(key);
                return (
                  <tr
                    key={key}
                    className={cn(
                      "transition-colors",
                      onRowClick && "cursor-pointer hover:bg-muted/60",
                      isSelected && "bg-accent/50",
                    )}
                    onClick={() => onRowClick?.(row)}
                  >
                    {selectable && (
                      <td className="px-4 py-3.5" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          aria-label="Select row"
                          checked={isSelected}
                          onChange={() => toggle(key)}
                        />
                      </td>
                    )}
                    {columns.map((col) => (
                      <td key={col.key} className={cn("px-4 py-3.5 align-middle", col.className)}>
                        {col.cell(row)}
                      </td>
                    ))}
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
      {!loading && rows.length === 0 && empty && (
        <div className="p-6">
          <EmptyState title={empty.title} description={empty.description} action={empty.action} />
        </div>
      )}
      {pageInfo && (rows.length > 0 || pageInfo.hasNextPage) && (
        <div className="flex items-center justify-between border-t px-4 py-2 text-xs text-muted-foreground">
          <span>{rows.length} shown</span>
          <div className="flex gap-2">
            {pageInfo.onFirst && (
              <Button variant="ghost" size="sm" onClick={pageInfo.onFirst}>
                First page
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              disabled={!pageInfo.hasNextPage}
              loading={pageInfo.loadingMore}
              onClick={pageInfo.onNext}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

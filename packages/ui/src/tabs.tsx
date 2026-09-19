"use client";

import { cn } from "./cn";

export interface TabItem<T extends string> {
  value: T;
  label: string;
  count?: number | undefined;
}

export interface TabsProps<T extends string> {
  items: TabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
  "aria-label"?: string;
}

// Simple tablist for filtering views. Content switching is up to the caller.
export function Tabs<T extends string>({
  items,
  value,
  onChange,
  className,
  ...rest
}: TabsProps<T>) {
  return (
    <div
      role="tablist"
      aria-label={rest["aria-label"]}
      className={cn("flex gap-1 border-b", className)}
    >
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(item.value)}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm transition-colors",
              active
                ? "border-primary font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {item.label}
            {item.count !== undefined && (
              <span className="ml-1.5 rounded bg-muted px-1.5 text-xs text-muted-foreground">
                {item.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

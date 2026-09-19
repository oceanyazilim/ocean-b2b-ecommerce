"use client";

import type { StorefrontProductSummary } from "@ocean/types";
import { SearchIcon } from "@ocean/ui";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";

import { api } from "@/lib/client-api";
import { formatMoney } from "@/lib/money";

// Header search: a plain <form> submit always works (navigates to /search?q=...), and a
// debounced dropdown on top of it offers a handful of quick suggestions — the same
// progressive-enhancement shape as quick-order-view's variant search, reused here for products.
export function SearchBox() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<StorefrontProductSummary[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }
    setLoading(true);
    const handle = setTimeout(() => {
      api<{ data: { products: StorefrontProductSummary[] } }>(`/search?q=${encodeURIComponent(q)}&limit=5`)
        .then((res) => {
          setResults(res.data.products);
          setOpen(true);
        })
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(handle);
  }, [query]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function goToResults(q: string) {
    setOpen(false);
    router.push(`/search?q=${encodeURIComponent(q)}`);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (query.trim()) goToResults(query.trim());
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative w-full max-w-xs">
      <form onSubmit={onSubmit} role="search">
        <div className="relative">
          <SearchIcon
            size={16}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => results.length > 0 && setOpen(true)}
            onKeyDown={onKeyDown}
            type="search"
            placeholder="Search products"
            aria-label="Search products"
            autoComplete="off"
            className="h-9 w-full rounded-md border border-input bg-background pl-8 pr-3 text-sm"
          />
        </div>
      </form>
      {open && (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-md border bg-background shadow-popover">
          {loading && <p className="px-3 py-2 text-sm text-muted-foreground">Searching…</p>}
          {!loading && results.length === 0 && (
            <p className="px-3 py-2 text-sm text-muted-foreground">No matches.</p>
          )}
          {!loading &&
            results.map((p) => (
              <button
                key={p.id}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  setOpen(false);
                  setQuery("");
                  router.push(`/products/${p.handle}`);
                }}
                className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-muted"
              >
                <div className="h-9 w-9 shrink-0 overflow-hidden rounded bg-muted">
                  {p.image && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.image.url} alt={p.image.alt ?? p.title} className="h-full w-full object-cover" />
                  )}
                </div>
                <span className="min-w-0 flex-1 truncate font-medium">{p.title}</span>
                {p.priceRange && (
                  <span className="shrink-0 text-xs text-muted-foreground">{formatMoney(p.priceRange.min)}</span>
                )}
              </button>
            ))}
          {!loading && (
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                goToResults(query.trim());
              }}
              className="w-full border-t px-3 py-2 text-left text-xs font-medium text-primary hover:bg-muted"
            >
              See all results for &quot;{query.trim()}&quot;
            </button>
          )}
        </div>
      )}
    </div>
  );
}

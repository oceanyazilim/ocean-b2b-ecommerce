"use client";

import type { ConsentCategoryDefinition } from "@ocean/types";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { api } from "@/lib/client-api";

type CategoryChoices = Record<"functional" | "analytics" | "marketing", boolean>;

// Real, working consent banner (spec section 47): category toggles, accept-all/reject-all/
// customize, and — via the root layout only rendering this when GET /consent/rules came back
// with `current: null` — a choice that's remembered and never re-prompted. `optInRequired`
// decides what "customize" starts from: every non-necessary category OFF (GDPR/KVKK-style
// markets) or ON (a market with no such requirement), per the resolved market's rule.
export function ConsentBanner({
  categories,
  optInRequired,
}: {
  categories: ConsentCategoryDefinition[];
  optInRequired: boolean;
}) {
  const router = useRouter();
  const [hidden, setHidden] = useState(false);
  const [customizing, setCustomizing] = useState(false);
  const [pending, setPending] = useState(false);
  const [choices, setChoices] = useState<CategoryChoices>({
    functional: !optInRequired,
    analytics: !optInRequired,
    marketing: !optInRequired,
  });

  if (hidden) return null;

  async function submit(source: "accept_all" | "reject_all" | "customize", values: CategoryChoices) {
    setPending(true);
    try {
      await api("/consent", { body: { ...values, source } });
      setHidden(true);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t bg-background px-4 py-4 shadow-[0_-4px_16px_rgba(0,0,0,0.08)] sm:px-6">
      <div className="mx-auto flex max-w-4xl flex-col gap-3">
        <div>
          <p className="text-sm font-medium">We use cookies</p>
          <p className="mt-1 text-sm text-muted-foreground">
            We use necessary cookies to run this store, plus optional cookies for functionality,
            analytics, and marketing if you allow them. See our cookie categories below.
          </p>
        </div>

        {customizing && (
          <div className="flex flex-col gap-2 rounded-md border bg-canvas p-3">
            {categories.map((cat) => (
              <label key={cat.key} className="flex items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={cat.isAlwaysOn ? true : choices[cat.key as keyof CategoryChoices]}
                  disabled={cat.isAlwaysOn}
                  onChange={(e) =>
                    setChoices((prev) => ({ ...prev, [cat.key]: e.target.checked }) as CategoryChoices)
                  }
                />
                <span>
                  <span className="font-medium">{cat.label}</span>
                  {cat.isAlwaysOn && <span className="text-muted-foreground"> (always on)</span>}
                  <br />
                  <span className="text-muted-foreground">{cat.description}</span>
                </span>
              </label>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-end gap-2">
          {!customizing && (
            <button
              type="button"
              onClick={() => setCustomizing(true)}
              disabled={pending}
              className="rounded-md px-3 py-1.5 text-xs font-medium underline-offset-2 hover:underline disabled:opacity-50"
            >
              Customize
            </button>
          )}
          {customizing ? (
            <button
              type="button"
              onClick={() => void submit("customize", choices)}
              disabled={pending}
              className="rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background disabled:opacity-50"
            >
              Save preferences
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => void submit("reject_all", { functional: false, analytics: false, marketing: false })}
                disabled={pending}
                className="rounded-md border px-3 py-1.5 text-xs font-medium disabled:opacity-50"
              >
                Reject all
              </button>
              <button
                type="button"
                onClick={() => void submit("accept_all", { functional: true, analytics: true, marketing: true })}
                disabled={pending}
                className="rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background disabled:opacity-50"
              >
                Accept all
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

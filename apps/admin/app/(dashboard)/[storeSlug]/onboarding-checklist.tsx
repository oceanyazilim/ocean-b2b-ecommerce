"use client";

import { ONBOARDING_STEPS, type OnboardingStep, type StoreSummary } from "@ocean/types";
import { Alert, Card, CardContent, CardDescription, CardHeader, CardTitle, cn } from "@ocean/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { api, errorMessage } from "@/lib/api";

const LABELS: Record<OnboardingStep, { title: string; description: string; href?: string }> = {
  business_details: {
    title: "Confirm business details",
    description: "Store name, currency, language and time zone.",
    href: "settings/general",
  },
  first_product: { title: "Add your first product", description: "Products arrive in Phase 2." },
  payments: { title: "Set up payments", description: "Payment providers arrive in Phase 7." },
  shipping: { title: "Configure shipping", description: "Shipping zones arrive in Phase 7." },
  taxes: { title: "Configure taxes", description: "Tax rules arrive in Phase 7." },
  domain: { title: "Connect a domain", description: "Custom domains arrive in Phase 8." },
  theme: {
    title: "Choose and customize a theme",
    description: "Theme editor arrives in Phase 10.",
  },
  launch: { title: "Launch your store", description: "Make the storefront public." },
};

export function OnboardingChecklist({
  storeId,
  storeSlug,
  state,
  editable,
}: {
  storeId: string;
  storeSlug: string;
  state: Record<string, boolean>;
  editable: boolean;
}) {
  const router = useRouter();
  const [local, setLocal] = useState(state);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const done = ONBOARDING_STEPS.filter((s) => local[s]).length;
  const percent = Math.round((done / ONBOARDING_STEPS.length) * 100);

  function toggle(step: OnboardingStep) {
    if (!editable) return;
    const next = !local[step];
    const previous = local;
    setLocal({ ...local, [step]: next });
    setError(null);
    startTransition(async () => {
      try {
        const res = await api<{ data: StoreSummary }>(`/stores/${storeId}/onboarding`, {
          method: "PATCH",
          body: { step, completed: next },
        });
        setLocal(res.data.onboardingState);
        router.refresh();
      } catch (err) {
        setLocal(previous);
        setError(errorMessage(err));
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-4">
          <div>
            <CardTitle>Setup guide</CardTitle>
            <CardDescription>
              {done} of {ONBOARDING_STEPS.length} steps complete
            </CardDescription>
          </div>
          <span className="text-sm font-medium tabular-nums">{percent}%</span>
        </div>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
          <div className="h-full bg-primary transition-all" style={{ width: `${percent}%` }} />
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        {error && <Alert variant="error">{error}</Alert>}
        <ul className="divide-y">
          {ONBOARDING_STEPS.map((step) => {
            const meta = LABELS[step];
            const checked = !!local[step];
            return (
              <li key={step} className="flex items-start gap-3 py-3">
                <input
                  id={`step-${step}`}
                  type="checkbox"
                  className="mt-1 h-4 w-4 cursor-pointer accent-[hsl(var(--primary))] disabled:cursor-not-allowed"
                  checked={checked}
                  disabled={!editable || pending}
                  onChange={() => toggle(step)}
                />
                <label htmlFor={`step-${step}`} className="flex flex-1 cursor-pointer flex-col">
                  <span
                    className={cn(
                      "text-sm font-medium",
                      checked && "text-muted-foreground line-through",
                    )}
                  >
                    {meta.title}
                  </span>
                  <span className="text-xs text-muted-foreground">{meta.description}</span>
                </label>
                {meta.href && (
                  <Link
                    href={`/${storeSlug}/${meta.href}`}
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    Open
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}

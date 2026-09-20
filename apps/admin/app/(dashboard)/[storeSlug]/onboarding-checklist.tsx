"use client";

import { ONBOARDING_STEPS, type OnboardingStep, type StoreSummary } from "@ocean/types";
import { Alert, Card, CardContent, CardDescription, CardHeader, CardTitle, cn } from "@ocean/ui";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { api, errorMessage } from "@/lib/api";

// Maps each onboarding step to its translation key under dashboard.onboarding.steps
// (locales/{en,tr}/dashboard.json) and, where relevant, the settings sub-page it deep-links to.
const STEP_META: Record<OnboardingStep, { key: string; href?: string }> = {
  business_details: { key: "businessDetails", href: "settings/general" },
  first_product: { key: "firstProduct" },
  payments: { key: "payments" },
  shipping: { key: "shipping" },
  taxes: { key: "taxes" },
  domain: { key: "domain" },
  theme: { key: "theme" },
  launch: { key: "launch" },
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
  const t = useTranslations("dashboard.onboarding");
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
            <CardTitle>{t("title")}</CardTitle>
            <CardDescription>
              {t("stepsComplete", { done, total: ONBOARDING_STEPS.length })}
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
            const meta = STEP_META[step];
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
                    {t(`steps.${meta.key}.title`)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {t(`steps.${meta.key}.description`)}
                  </span>
                </label>
                {meta.href && (
                  <Link
                    href={`/${storeSlug}/${meta.href}`}
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    {t("open")}
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

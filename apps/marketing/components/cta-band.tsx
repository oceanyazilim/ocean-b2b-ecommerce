import { Button } from "@ocean/ui";
import Link from "next/link";

import { ADMIN_URL } from "./nav-links";

export function CtaBand({
  title = "Ready to move your wholesale business online?",
  description = "Start on the free Starter plan, or talk to us about an Enterprise rollout across your organization.",
}: {
  title?: string;
  description?: string;
}) {
  return (
    <section className="border-t">
      <div className="mx-auto flex max-w-4xl flex-col items-center gap-6 px-6 py-20 text-center">
        <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h2>
        <p className="max-w-xl text-muted-foreground">{description}</p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link href={`${ADMIN_URL}/signup`}>
            <Button size="lg">Start free</Button>
          </Link>
          <Link href="/pricing">
            <Button size="lg" variant="outline">
              See pricing
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
}

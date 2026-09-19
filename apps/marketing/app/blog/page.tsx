import { EmptyState } from "@ocean/ui";
import type { Metadata } from "next";

import { PageHero } from "@/components/page-hero";

export const metadata: Metadata = {
  title: "Blog",
  description: "Notes on B2B commerce, wholesale operations, and product updates from Ocean Commerce.",
};

export default function BlogPage() {
  return (
    <>
      <PageHero
        eyebrow="Blog"
        title="Notes on B2B commerce and product updates"
        description="We're just getting the blog started. Posts on pricing strategy, wholesale operations, and product releases will land here."
      />
      <section className="mx-auto max-w-3xl px-6 py-16">
        <EmptyState
          title="No posts yet"
          description="Check back soon, or explore the feature and resource pages in the meantime."
        />
      </section>
    </>
  );
}

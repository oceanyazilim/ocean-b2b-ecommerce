import type { ThemeSectionInstance } from "@ocean/types";

import { BlockList } from "../block-renderer";

export function RichText({ section }: { section: ThemeSectionInstance }) {
  return (
    <section className="mx-auto flex max-w-2xl flex-col items-center gap-3 px-6 py-12 text-center sm:px-12">
      <BlockList blocks={section.blocks} blockOrder={section.blockOrder} className="flex flex-col items-center gap-3" />
    </section>
  );
}

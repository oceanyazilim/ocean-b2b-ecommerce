import type { ThemeSectionInstance } from "@ocean/types";

import { BlockList } from "../block-renderer";

export function ImageWithText({ section }: { section: ThemeSectionInstance }) {
  const image = typeof section.settings.image === "string" ? section.settings.image : null;

  return (
    <section className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-10 px-6 py-14 sm:px-12 md:grid-cols-2">
      <div className="aspect-video overflow-hidden rounded-lg bg-muted">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
            No image
          </div>
        )}
      </div>
      <BlockList blocks={section.blocks} blockOrder={section.blockOrder} className="flex flex-col items-start gap-3" />
    </section>
  );
}

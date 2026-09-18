import type { ThemeSectionInstance } from "@ocean/types";

import { BlockList } from "../block-renderer";

export function Hero({ section }: { section: ThemeSectionInstance }) {
  const heading = String(section.settings.heading ?? "Welcome");
  const backgroundImage = typeof section.settings.backgroundImage === "string" ? section.settings.backgroundImage : null;

  return (
    <section
      className="relative flex min-h-[320px] flex-col items-start justify-center gap-4 bg-muted px-6 py-16 sm:px-12"
      style={backgroundImage ? { backgroundImage: `url(${backgroundImage})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}
    >
      <h1 className="max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">{heading}</h1>
      <BlockList blocks={section.blocks} blockOrder={section.blockOrder} className="flex flex-col items-start gap-3" />
    </section>
  );
}

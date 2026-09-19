import type { ThemeSectionInstance } from "@ocean/types";

import { BlockList } from "../block-renderer";

export function Hero({ section }: { section: ThemeSectionInstance }) {
  const heading = String(section.settings.heading ?? "Welcome");
  const backgroundImage = typeof section.settings.backgroundImage === "string" ? section.settings.backgroundImage : null;

  return (
    <section
      className="relative flex min-h-[360px] flex-col items-start justify-center gap-5 overflow-hidden bg-muted px-6 py-20 sm:px-12"
      style={backgroundImage ? { backgroundImage: `url(${backgroundImage})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}
    >
      {backgroundImage && <div className="absolute inset-0 bg-black/35" aria-hidden />}
      <h1
        className={
          "relative max-w-2xl text-4xl font-semibold tracking-tight sm:text-5xl" +
          (backgroundImage ? " text-white drop-shadow-sm" : "")
        }
      >
        {heading}
      </h1>
      <BlockList
        blocks={section.blocks}
        blockOrder={section.blockOrder}
        className="relative flex flex-col items-start gap-3"
      />
    </section>
  );
}

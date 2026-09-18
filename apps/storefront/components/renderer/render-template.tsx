import type { TemplateConfiguration } from "@ocean/types";

import { FeaturedProducts } from "./sections/featured-products";
import { Hero } from "./sections/hero";
import { ImageWithText } from "./sections/image-with-text";
import { RichText } from "./sections/rich-text";

// Dispatches each configured section to its component by type. An unknown section type (a
// manifest ahead of this renderer) is skipped rather than crashing the page.
export function RenderTemplate({ template }: { template: TemplateConfiguration | undefined }) {
  if (!template) return null;
  const ids = template.sectionOrder.length > 0 ? template.sectionOrder : Object.keys(template.sections);

  return (
    <>
      {ids.map((id) => {
        const section = template.sections[id];
        if (!section) return null;
        switch (section.type) {
          case "hero":
            return <Hero key={id} section={section} />;
          case "featured-products":
            return <FeaturedProducts key={id} section={section} />;
          case "rich-text":
            return <RichText key={id} section={section} />;
          case "image-with-text":
            return <ImageWithText key={id} section={section} />;
          default:
            return null;
        }
      })}
    </>
  );
}

import type { ThemeBlockInstance } from "@ocean/types";

// The Foundation manifest's three block types. A theme with more block types would extend this
// map; an unknown type renders nothing rather than crashing the page.
export function BlockRenderer({ block }: { block: ThemeBlockInstance }) {
  switch (block.type) {
    case "heading": {
      const text = String(block.settings.text ?? "");
      if (!text) return null;
      return <h3 className="text-xl font-semibold tracking-tight">{text}</h3>;
    }
    case "text": {
      const text = String(block.settings.text ?? "");
      if (!text) return null;
      return <div className="rich-text text-muted-foreground" dangerouslySetInnerHTML={{ __html: text }} />;
    }
    case "button": {
      const label = String(block.settings.label ?? "Shop now");
      const url = typeof block.settings.url === "string" ? block.settings.url : "#";
      return (
        <a
          href={url}
          className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          {label}
        </a>
      );
    }
    default:
      return null;
  }
}

export function BlockList({
  blocks,
  blockOrder,
  className,
}: {
  blocks: Record<string, ThemeBlockInstance>;
  blockOrder: string[];
  className?: string;
}) {
  const ids = blockOrder.length > 0 ? blockOrder : Object.keys(blocks);
  if (ids.length === 0) return null;
  return (
    <div className={className}>
      {ids.map((id) => {
        const block = blocks[id];
        if (!block) return null;
        return <BlockRenderer key={id} block={block} />;
      })}
    </div>
  );
}

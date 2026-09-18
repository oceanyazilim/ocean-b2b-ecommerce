import { RenderTemplate } from "@/components/renderer/render-template";
import { getTheme } from "@/lib/storefront";

export default async function HomePage() {
  const theme = await getTheme();

  if (!theme) {
    return (
      <div className="mx-auto flex max-w-xl flex-col items-center gap-3 px-6 py-24 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">This store isn&apos;t set up yet</h1>
        <p className="text-muted-foreground">No theme has been published for this storefront.</p>
      </div>
    );
  }

  return <RenderTemplate template={theme.templates["home.default"]} />;
}

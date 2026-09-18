import type { QuoteDetail } from "@ocean/types";
import { Alert } from "@ocean/ui";
import { notFound } from "next/navigation";

import { api, isApiError } from "@/lib/api";
import { can, cookieHeader } from "@/lib/session";
import { loadStorePage } from "@/lib/store-page";

import { QuoteEditor } from "../quote-editor";

export const metadata = { title: "Quote · Ocean Admin" };

export default async function QuoteDetailPage({
  params,
}: {
  params: Promise<{ storeSlug: string; quoteId: string }>;
}) {
  const { storeSlug, quoteId } = await params;
  const { store } = await loadStorePage(storeSlug, `/quotes/${quoteId}`);
  if (!can(store, "quotes.read")) {
    return <Alert variant="warning">Your role cannot view quotes.</Alert>;
  }
  let quote: QuoteDetail;
  try {
    quote = (
      await api<{ data: QuoteDetail }>(`/stores/${store.id}/quotes/${quoteId}`, {
        cookie: await cookieHeader(),
      })
    ).data;
  } catch (err) {
    if (isApiError(err, "not_found")) notFound();
    throw err;
  }
  return <QuoteEditor storeId={store.id} storeSlug={store.slug} quote={quote} canWrite={can(store, "quotes.write")} />;
}

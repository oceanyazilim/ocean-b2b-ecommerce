import { Alert } from "@ocean/ui";

import { can } from "@/lib/session";
import { loadStorePage } from "@/lib/store-page";

import { PaymentMethodsManager } from "./payment-methods-manager";

export const metadata = { title: "Payment methods · Ocean Admin" };

export default async function PaymentMethodsPage({
  params,
}: {
  params: Promise<{ storeSlug: string }>;
}) {
  const { storeSlug } = await params;
  const { store } = await loadStorePage(storeSlug, "/settings/payment-methods");
  if (!can(store, "payments.read"))
    return <Alert variant="warning">Your role cannot view payment methods.</Alert>;
  return (
    <PaymentMethodsManager storeId={store.id} canWrite={can(store, "payments.write")} />
  );
}

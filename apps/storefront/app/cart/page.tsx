import { CartView } from "@/components/cart-view";
import { listPaymentMethods } from "@/lib/storefront";

export default async function CartPage() {
  const paymentMethods = await listPaymentMethods().catch(() => []);
  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="px-6 pt-10 text-2xl font-semibold tracking-tight">Cart</h1>
      <CartView paymentMethods={paymentMethods} />
    </div>
  );
}

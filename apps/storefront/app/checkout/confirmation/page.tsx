export default async function CheckoutConfirmationPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string }>;
}) {
  const { order } = await searchParams;

  return (
    <div className="mx-auto flex max-w-xl flex-col items-center gap-3 px-6 py-24 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Thank you for your order</h1>
      {order ? (
        <p className="text-muted-foreground">
          Your order reference is <span className="font-mono">{order}</span>. We&apos;ll follow up by email.
        </p>
      ) : (
        <p className="text-muted-foreground">Your order has been placed.</p>
      )}
    </div>
  );
}

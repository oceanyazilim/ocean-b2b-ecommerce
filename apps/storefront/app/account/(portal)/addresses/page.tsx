import { AddressManager } from "@/components/address-manager";
import { listAccountAddresses } from "@/lib/account";

export default async function AccountAddressesPage() {
  const addresses = await listAccountAddresses();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Addresses</h1>
      <AddressManager initialAddresses={addresses} />
    </div>
  );
}

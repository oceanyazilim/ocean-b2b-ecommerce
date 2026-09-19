import { formatAddressLines } from "@ocean/types";
import { Badge, Card, CardContent, CardHeader, CardTitle } from "@ocean/ui";

import { getAccountCompany, getAccountProfile, listAccountCredit } from "@/lib/account";
import { formatMoney } from "@/lib/money";

export default async function AccountCompanyPage() {
  const [company, profile] = await Promise.all([getAccountCompany(), getAccountProfile()]);

  if (!company) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-semibold tracking-tight">Company</h1>
        <p className="text-sm text-muted-foreground">
          Your account isn&apos;t linked to a company yet.
        </p>
      </div>
    );
  }

  const role = profile.companies[0]?.role;
  const canSeeCredit = role === "company_admin" || role === "finance";
  const credit = canSeeCredit ? await listAccountCredit() : [];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{company.displayName}</h1>
        <p className="text-sm text-muted-foreground">{company.legalName}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Status</CardTitle>
          </CardHeader>
          <CardContent>
            <Badge variant={company.status === "active" ? "success" : "outline"}>{company.status}</Badge>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Currency</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-semibold">{company.currency}</p>
          </CardContent>
        </Card>
        {company.taxNumber && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Tax number</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-lg font-semibold">{company.taxNumber}</p>
            </CardContent>
          </Card>
        )}
      </div>

      {credit.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Credit accounts</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 pt-0 text-sm">
            {credit.map((account) => (
              <div key={account.id} className="flex items-center justify-between border-t pt-3 first:border-t-0 first:pt-0">
                <div>
                  <p className="font-medium">{formatMoney(account.available)} available</p>
                  <p className="text-muted-foreground">
                    {formatMoney(account.used)} used of {formatMoney(account.limit)} limit
                  </p>
                </div>
                <Badge variant="outline">{account.onExceedPolicy}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Locations</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 pt-0">
          {company.locations.map((location) => (
            <div key={location.id} className="flex flex-wrap items-start justify-between gap-3 border-t pt-4 text-sm first:border-t-0 first:pt-0">
              <div>
                <p className="font-medium">
                  {location.name}
                  {location.isDefault && (
                    <Badge variant="secondary" className="ml-2">
                      Default
                    </Badge>
                  )}
                </p>
                <div className="mt-1 text-muted-foreground">
                  {formatAddressLines(location.shippingAddress).map((line, i) => (
                    <p key={i}>{line}</p>
                  ))}
                </div>
              </div>
              {!location.isActive && <Badge variant="outline">Inactive</Badge>}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

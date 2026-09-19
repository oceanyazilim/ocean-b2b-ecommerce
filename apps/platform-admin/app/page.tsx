import { redirect } from "next/navigation";

import { getPlatformOperator } from "@/lib/session";

export default async function RootPage() {
  const me = await getPlatformOperator();
  redirect(me ? "/organizations" : "/login");
}

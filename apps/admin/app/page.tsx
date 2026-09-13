import { redirect } from "next/navigation";

import { getMe, homePath } from "@/lib/session";

export default async function RootPage() {
  const me = await getMe();
  redirect(me ? homePath(me) : "/login");
}

"use server";

import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { selectAccount } from "@/lib/workspace";

/** Sidebar account switch. Auth is enforced inside `selectAccount`. */
export async function selectAccountAction(accountId: string) {
  await selectAccount(accountId);
}

export async function signOutAction() {
  const session = await getSession();
  session.destroy();
  redirect("/login");
}

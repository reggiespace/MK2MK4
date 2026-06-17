import "server-only";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";

/** Returns the operator session or a 401 response. Usage:
 *  const auth = await guard(); if (auth instanceof NextResponse) return auth;
 */
export async function guard(): Promise<
  { operatorId: string } | NextResponse
> {
  const session = await getSession();
  if (!session.operatorId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return { operatorId: session.operatorId };
}

export function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export function serverError(message: string) {
  return NextResponse.json({ error: message }, { status: 500 });
}

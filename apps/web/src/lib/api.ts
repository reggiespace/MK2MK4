import "server-only";
import { NextResponse } from "next/server";
import { getSession, type AuthContext } from "@/lib/session";

/**
 * Route-handler auth guard. Usage:
 *   const auth = await guard();
 *   if (auth instanceof NextResponse) return auth;
 */
export async function guard(): Promise<AuthContext | NextResponse> {
  const session = await getSession();
  if (!session.userId || !session.workspaceId || !session.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return { userId: session.userId, workspaceId: session.workspaceId, email: session.email };
}

export function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export function serverError(message: string) {
  return NextResponse.json({ error: message }, { status: 500 });
}

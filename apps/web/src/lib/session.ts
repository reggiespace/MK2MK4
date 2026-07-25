import "server-only";
import { getIronSession, type SessionOptions } from "iron-session";
import { cookies } from "next/headers";
import { env } from "@/lib/env";

export interface SessionData {
  userId?: string;
  workspaceId?: string;
  email?: string;
  /** Brand account the sidebar switcher last selected. */
  accountId?: string;
}

const sessionOptions: SessionOptions = {
  password: env.sessionSecret(),
  cookieName: "rs_studio_session",
  cookieOptions: {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  },
};

export async function getSession() {
  return getIronSession<SessionData>(await cookies(), sessionOptions);
}

export class UnauthorizedError extends Error {
  constructor() {
    super("Unauthorized");
    this.name = "UnauthorizedError";
  }
}

export interface AuthContext {
  userId: string;
  workspaceId: string;
  email: string;
}

/**
 * Every server action and route handler must call this before touching data —
 * server functions are reachable by direct POST, not only through our UI.
 */
export async function requireAuth(): Promise<AuthContext> {
  const session = await getSession();
  if (!session.userId || !session.workspaceId || !session.email) {
    throw new UnauthorizedError();
  }
  return { userId: session.userId, workspaceId: session.workspaceId, email: session.email };
}

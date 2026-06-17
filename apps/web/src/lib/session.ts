import "server-only";
import { getIronSession, type SessionOptions } from "iron-session";
import { cookies } from "next/headers";
import { env } from "@/lib/env";

export interface SessionData {
  operatorId?: string;
  email?: string;
}

const sessionOptions: SessionOptions = {
  password: env.sessionSecret(),
  cookieName: "giq_session",
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

export async function requireOperator(): Promise<{ operatorId: string; email: string }> {
  const session = await getSession();
  if (!session.operatorId || !session.email) {
    throw new UnauthorizedError();
  }
  return { operatorId: session.operatorId, email: session.email };
}

export class UnauthorizedError extends Error {
  constructor() {
    super("Unauthorized");
    this.name = "UnauthorizedError";
  }
}

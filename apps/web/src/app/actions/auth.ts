"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";

const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});

export type LoginState = { error?: string };

/** Compare against this when the email is unknown, so timing doesn't leak. */
const DUMMY_HASH = "$2a$12$invalidinvalidinvalidinvalidinvalidinvalidin";

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: "Enter a valid email and password." };
  }

  try {
    const user = await prisma.user.findUnique({
      where: { email: parsed.data.email.toLowerCase() },
    });
    const ok = await bcrypt.compare(parsed.data.password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !ok) {
      return { error: "Invalid email or password." };
    }

    const session = await getSession();
    session.userId = user.id;
    session.workspaceId = user.workspaceId;
    session.email = user.email;
    await session.save();
  } catch (err) {
    console.error("[loginAction]", err);
    return { error: "Something went wrong signing in. Try again." };
  }

  // Outside the try — `redirect` signals by throwing.
  redirect("/");
}

export async function logoutAction(): Promise<void> {
  const session = await getSession();
  session.destroy();
  redirect("/login");
}

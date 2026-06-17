"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export type LoginState = { error?: string };

export async function loginAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  try {
    console.log("[loginAction] start");
    const parsed = loginSchema.safeParse({
      email: formData.get("email"),
      password: formData.get("password"),
    });
    console.log("[loginAction] parsed:", parsed.success);
    if (!parsed.success) {
      return { error: "Enter a valid email and password." };
    }

    console.log("[loginAction] querying operator");
    const operator = await prisma.operator.findUnique({
      where: { email: parsed.data.email },
    });
    console.log("[loginAction] operator found:", !!operator);
    // Always run a hash compare to avoid leaking whether the email exists.
    const hash =
      operator?.passwordHash ?? "$2a$12$invalidinvalidinvalidinvalidinvalidinvalidin";
    const ok = await bcrypt.compare(parsed.data.password, hash);
    console.log("[loginAction] ok:", ok);
    if (!operator || !ok) {
      return { error: "Invalid email or password." };
    }

    console.log("[loginAction] getting session");
    const session = await getSession();
    session.operatorId = operator.id;
    session.email = operator.email;
    console.log("[loginAction] saving session");
    await session.save();
    console.log("[loginAction] redirecting");

    redirect("/");
  } catch (e) {
    console.error("[loginAction] UNCAUGHT ERROR:", e);
    throw e;
  }
}

export async function logoutAction(): Promise<void> {
  const session = await getSession();
  session.destroy();
  redirect("/login");
}

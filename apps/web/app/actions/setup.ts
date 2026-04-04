"use server";

import { count, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { user } from "@/db/schema";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function getUserCount() {
  const [{ n }] = await db.select({ n: count() }).from(user);
  return n;
}

export async function bootstrapFirstAdmin(input: {
  email: string;
  password: string;
  name: string;
}) {
  const [{ n }] = await db.select({ n: count() }).from(user);
  if (n > 0) throw new Error("Application is already set up.");

  await auth.api.signUpEmail({
    body: {
      email: input.email,
      password: input.password,
      name: input.name,
    },
    headers: await headers(),
  });

  await db
    .update(user)
    .set({ role: "admin" })
    .where(eq(user.email, input.email));
}

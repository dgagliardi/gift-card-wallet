import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { nextCookies } from "better-auth/next-js";
import { count } from "drizzle-orm";
import * as schema from "@/db/schema";
import { db } from "@/lib/db";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
const defaultDevUrl = `http://localhost:3000${basePath}`;

const googleId = process.env.GOOGLE_CLIENT_ID;
const googleSecret = process.env.GOOGLE_CLIENT_SECRET;
const hasGoogle = Boolean(googleId && googleSecret);

/** Email/password only when explicitly enabled, or when Google OAuth is not configured (local dev). */
const emailPassword =
  process.env.ENABLE_EMAIL_PASSWORD === "true" || !hasGoogle;

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL || defaultDevUrl,
  secret: process.env.BETTER_AUTH_SECRET || "dev-only-change-in-production",
  database: drizzleAdapter(db, {
    provider: "sqlite",
    schema,
    camelCase: true,
  }),
  emailAndPassword: {
    enabled: emailPassword,
  },
  ...(hasGoogle
    ? {
        socialProviders: {
          google: {
            clientId: googleId!,
            clientSecret: googleSecret!,
          },
        },
      }
    : {}),
  databaseHooks: {
    user: {
      create: {
        before: async (userData) => {
          const [{ n }] = await db.select({ n: count() }).from(schema.user);
          if (n === 0) {
            return {
              data: {
                ...userData,
                role: "admin",
              },
            };
          }
          return { data: userData };
        },
      },
    },
  },
  user: {
    additionalFields: {
      role: {
        type: "string",
        required: false,
        defaultValue: "user",
        input: false,
      },
    },
  },
  plugins: [nextCookies()],
  advanced: {
    // App runs behind nginx — trust proxy headers so better-auth reads the
    // real client IP (for rate limiting) and honours X-Forwarded-Proto (so
    // the session cookie gets the Secure flag on HTTPS, fixing mobile Safari).
    useSecureCookies: process.env.NODE_ENV === "production",
    ipAddress: {
      ipAddressHeaders: ["x-forwarded-for", "x-real-ip"],
      trustedProxies: ["127.0.0.1", "::1"],
    },
  },
});

export type Session = typeof auth.$Infer.Session;

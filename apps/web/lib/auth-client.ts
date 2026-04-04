import { createAuthClient } from "better-auth/react";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

let browserClient: ReturnType<typeof createAuthClient> | null = null;

export function getAuthClient() {
  if (typeof window !== "undefined") {
    if (!browserClient) {
      browserClient = createAuthClient({
        baseURL: `${window.location.origin}${basePath}/api/auth`,
      });
    }
    return browserClient;
  }
  return createAuthClient({
    baseURL: `${(process.env.NEXT_PUBLIC_APP_ORIGIN || "http://localhost:3000").replace(/\/$/, "")}${basePath}/api/auth`,
  });
}

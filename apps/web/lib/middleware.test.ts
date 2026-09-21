import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { middleware } from "../middleware";

const signedOut = (path: string) =>
  middleware(new NextRequest(`https://wallet.example.com${path}`));

describe("middleware auth gate", () => {
  it("sends a signed-out visitor to the login page", () => {
    const response = signedOut("/expenses");

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://wallet.example.com/login",
    );
  });

  it("serves the offline fallback without a session", () => {
    // The service worker precaches /offline by fetching it, and renders it
    // when the network is gone. Redirecting it to /login would cache the login
    // page as the offline screen and show it to a signed-in user.
    const response = signedOut("/offline");

    expect(response.headers.get("location")).toBeNull();
  });
});

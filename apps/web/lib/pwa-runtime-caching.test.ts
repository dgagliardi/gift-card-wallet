import { describe, expect, it } from "vitest";
import { pwaOptions, runtimeCaching } from "./pwa-runtime-caching.mjs";

type Entry = (typeof runtimeCaching)[number];

const ORIGIN = "https://wallet.example.com";

/**
 * Mirrors how Workbox resolves a request: routes are tried in registration
 * order and the first match wins.
 */
function matchEntry(href: string, headers: Record<string, string> = {}) {
  const url = new URL(href);
  const request = {
    headers: { get: (name: string) => headers[name] ?? null },
    destination: "",
  };
  const context = { url, request, sameOrigin: url.origin === ORIGIN };

  return runtimeCaching.find((entry: Entry) =>
    entry.urlPattern instanceof RegExp
      ? entry.urlPattern.test(url.href)
      : entry.urlPattern(context),
  );
}

const cacheNameFor = (href: string, headers?: Record<string, string>) =>
  matchEntry(href, headers)?.options.cacheName;

describe("PWA runtime caching", () => {
  describe("weak-signal resilience", () => {
    it("bounds the network wait for same-origin page navigations", () => {
      const entry = matchEntry(`${ORIGIN}/card/abc123`);

      expect(entry?.handler).toBe("NetworkFirst");
      expect(entry?.options.networkTimeoutSeconds).toBeGreaterThan(0);
      expect(entry?.options.networkTimeoutSeconds).toBeLessThanOrEqual(5);
    });

    it("bounds the network wait for RSC navigations", () => {
      const entry = matchEntry(`${ORIGIN}/expenses`, { RSC: "1" });

      expect(entry?.options.cacheName).toBe("pages-rsc");
      expect(entry?.options.networkTimeoutSeconds).toBeGreaterThan(0);
    });

    it("bounds the network wait for RSC prefetches", () => {
      const entry = matchEntry(`${ORIGIN}/expenses`, {
        RSC: "1",
        "Next-Router-Prefetch": "1",
      });

      expect(entry?.options.cacheName).toBe("pages-rsc-prefetch");
      expect(entry?.options.networkTimeoutSeconds).toBeGreaterThan(0);
    });

    it("leaves no NetworkFirst route waiting on the network indefinitely", () => {
      const unbounded = runtimeCaching.filter(
        (entry: Entry) =>
          entry.handler === "NetworkFirst" &&
          !(entry.options.networkTimeoutSeconds! > 0),
      );

      expect(unbounded.map((entry: Entry) => entry.options.cacheName)).toEqual(
        [],
      );
    });
  });

  describe("card images", () => {
    const upload = `${ORIGIN}/api/uploads/user123/card456_IMG_0001.jpg`;

    it("keeps barcodes in a dedicated cache, not the shared image budget", () => {
      expect(cacheNameFor(upload)).toBe("card-images");
    });

    it("caches barcodes whose filename carries no usable extension", () => {
      expect(
        cacheNameFor(`${ORIGIN}/api/uploads/user123/card456_IMG_0001.HEIC`),
      ).toBe("card-images");
    });

    it("serves a stored barcode without waiting for the network", () => {
      const entry = matchEntry(upload);

      expect(entry?.handler).toBe("StaleWhileRevalidate");
    });

    it("holds enough cards to cover a real wallet for a full month", () => {
      const entry = matchEntry(upload);

      expect(entry?.options.expiration?.maxEntries).toBeGreaterThanOrEqual(128);
      expect(entry?.options.expiration?.maxAgeSeconds).toBeGreaterThanOrEqual(
        30 * 24 * 60 * 60,
      );
    });

    it("never stores an auth failure in place of a barcode", () => {
      const entry = matchEntry(upload);

      // /api/uploads returns 401 once the session lapses. Caching that for a
      // month would break the card at the register long after sign-in is fixed.
      expect(entry?.options.cacheableResponse?.statuses).toEqual([200]);
    });

    it("takes precedence over the generic image and api rules", () => {
      const names = runtimeCaching.map((e: Entry) => e.options.cacheName);

      expect(names.indexOf("card-images")).toBeLessThan(
        names.indexOf("static-image-assets"),
      );
      expect(names.indexOf("card-images")).toBeLessThan(names.indexOf("apis"));
    });
  });

  describe("preserved defaults", () => {
    it("never caches the auth callback", () => {
      expect(
        cacheNameFor(`${ORIGIN}/api/auth/callback/google?code=xyz`),
      ).toBeUndefined();
    });

    it("still bounds cross-origin requests", () => {
      const entry = matchEntry("https://fonts.example.com/thing.txt");

      expect(entry?.options.cacheName).toBe("cross-origin");
      expect(entry?.options.networkTimeoutSeconds).toBeGreaterThan(0);
    });

    it("still serves hashed build assets from cache first", () => {
      const entry = matchEntry(`${ORIGIN}/_next/static/chunks/main-abc.js`);

      expect(entry?.options.cacheName).toBe("next-static-js-assets");
      expect(entry?.handler).toBe("CacheFirst");
    });
  });
});

describe("PWA options", () => {
  it("installs these rules instead of next-pwa's defaults", () => {
    expect(pwaOptions.workboxOptions.runtimeCaching).toBe(runtimeCaching);
  });

  it("routes the start URL through the bounded page rule", () => {
    // next-pwa's own start-url route is NetworkFirst with no timeout, which is
    // the exact hang this change exists to remove. Suppressing it lets "/" fall
    // through to the "pages" rule.
    //
    // Both flags are required: against the built sw.js, cacheStartUrl alone
    // left the route in place. This test can only check the config we pass —
    // scripts/verify-service-worker.mjs checks what next-pwa actually emits.
    expect(pwaOptions.cacheStartUrl).toBe(false);
    expect(pwaOptions.dynamicStartUrl).toBe(false);

    const startUrl = matchEntry(`${ORIGIN}/`);
    expect(startUrl?.options.cacheName).toBe("pages");
    expect(startUrl?.options.networkTimeoutSeconds).toBeGreaterThan(0);
  });

  it("shows a real page when a navigation has no cached copy", () => {
    expect(pwaOptions.fallbacks.document).toBe("/offline");
  });
});

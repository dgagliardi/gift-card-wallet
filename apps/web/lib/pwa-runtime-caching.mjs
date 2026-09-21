/**
 * Service worker runtime caching for the wallet PWA.
 *
 * This replaces `@ducanh2912/next-pwa`'s defaults wholesale — supplying
 * `workboxOptions.runtimeCaching` opts out of them entirely, so every rule the
 * app still needs is restated here.
 *
 * Two deliberate differences from the defaults:
 *
 * 1. Every `NetworkFirst` route sets `networkTimeoutSeconds`. The defaults
 *    leave the page and RSC routes unbounded, which means a stalled request on
 *    a weak cell connection never settles and the cached copy is never served.
 *    A request that fails fast falls back to cache; one that hangs does not.
 *    This is why the app was more usable in airplane mode than at one bar.
 *
 * 2. Card images get their own bucket instead of sharing the 64-entry
 *    `static-image-assets` budget with icons and chrome. A barcode you cannot
 *    load at the register is the one failure this app cannot absorb.
 *
 * Matcher functions are serialized into `sw.js` by workbox-webpack-plugin, so
 * they must be self-contained: no closures over module scope.
 *
 * Order matters. Workbox tries routes in registration order and the first
 * match wins, so `card-images` must precede the generic image and API rules.
 */

/** Long enough to win on a healthy network, short enough to not feel stuck. */
const PAGE_NETWORK_TIMEOUT_SECONDS = 3;

const DAY = 24 * 60 * 60;
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

export const runtimeCaching = [
  {
    // Barcodes and card photos. Served from `/api/uploads/*`, which means the
    // default rules either lumped them in with app icons (when the filename
    // happened to end in .jpg) or dropped them into the 16-entry `apis` bucket
    // (when it did not, e.g. .HEIC). `includes` rather than `startsWith` so a
    // NEXT_PUBLIC_BASE_PATH deployment still matches.
    urlPattern: ({ url, sameOrigin }) =>
      sameOrigin && url.pathname.includes("/api/uploads/"),
    handler: "StaleWhileRevalidate",
    options: {
      cacheName: "card-images",
      // A lapsed session turns these into 401s. Storing one would break the
      // card at the register for a month after sign-in is repaired.
      cacheableResponse: { statuses: [200] },
      expiration: { maxEntries: 256, maxAgeSeconds: MONTH },
    },
  },
  {
    urlPattern: /^https:\/\/fonts\.(?:gstatic)\.com\/.*/i,
    handler: "CacheFirst",
    options: {
      cacheName: "google-fonts-webfonts",
      expiration: { maxEntries: 4, maxAgeSeconds: YEAR },
    },
  },
  {
    urlPattern: /^https:\/\/fonts\.(?:googleapis)\.com\/.*/i,
    handler: "StaleWhileRevalidate",
    options: {
      cacheName: "google-fonts-stylesheets",
      expiration: { maxEntries: 4, maxAgeSeconds: 7 * DAY },
    },
  },
  {
    urlPattern: /\.(?:eot|otf|ttc|ttf|woff|woff2|font.css)$/i,
    handler: "StaleWhileRevalidate",
    options: {
      cacheName: "static-font-assets",
      expiration: { maxEntries: 4, maxAgeSeconds: 7 * DAY },
    },
  },
  {
    urlPattern: /\.(?:jpg|jpeg|gif|png|svg|ico|webp)$/i,
    handler: "StaleWhileRevalidate",
    options: {
      cacheName: "static-image-assets",
      expiration: { maxEntries: 64, maxAgeSeconds: MONTH },
    },
  },
  {
    urlPattern: /\/_next\/static.+\.js$/i,
    handler: "CacheFirst",
    options: {
      cacheName: "next-static-js-assets",
      expiration: { maxEntries: 64, maxAgeSeconds: DAY },
    },
  },
  {
    urlPattern: /\/_next\/image\?url=.+$/i,
    handler: "StaleWhileRevalidate",
    options: {
      cacheName: "next-image",
      expiration: { maxEntries: 64, maxAgeSeconds: DAY },
    },
  },
  {
    urlPattern: /\.(?:js)$/i,
    handler: "StaleWhileRevalidate",
    options: {
      cacheName: "static-js-assets",
      expiration: { maxEntries: 48, maxAgeSeconds: DAY },
    },
  },
  {
    urlPattern: /\.(?:css|less)$/i,
    handler: "StaleWhileRevalidate",
    options: {
      cacheName: "static-style-assets",
      expiration: { maxEntries: 32, maxAgeSeconds: DAY },
    },
  },
  {
    urlPattern: /\.(?:json|xml|csv)$/i,
    handler: "NetworkFirst",
    options: {
      cacheName: "static-data-assets",
      networkTimeoutSeconds: PAGE_NETWORK_TIMEOUT_SECONDS,
      expiration: { maxEntries: 32, maxAgeSeconds: DAY },
    },
  },
  {
    // Auth callbacks carry one-time codes and must never be replayed from
    // cache. Matching on `includes` keeps this correct under a base path.
    urlPattern: ({ url, sameOrigin }) =>
      sameOrigin &&
      url.pathname.includes("/api/") &&
      !url.pathname.includes("/api/auth/callback"),
    handler: "NetworkFirst",
    options: {
      cacheName: "apis",
      networkTimeoutSeconds: 10,
      expiration: { maxEntries: 16, maxAgeSeconds: DAY },
    },
  },
  {
    urlPattern: ({ url, request, sameOrigin }) =>
      sameOrigin &&
      !url.pathname.includes("/api/") &&
      request.headers.get("RSC") === "1" &&
      request.headers.get("Next-Router-Prefetch") === "1",
    handler: "NetworkFirst",
    options: {
      cacheName: "pages-rsc-prefetch",
      networkTimeoutSeconds: PAGE_NETWORK_TIMEOUT_SECONDS,
      expiration: { maxEntries: 32, maxAgeSeconds: DAY },
    },
  },
  {
    urlPattern: ({ url, request, sameOrigin }) =>
      sameOrigin &&
      !url.pathname.includes("/api/") &&
      request.headers.get("RSC") === "1",
    handler: "NetworkFirst",
    options: {
      cacheName: "pages-rsc",
      networkTimeoutSeconds: PAGE_NETWORK_TIMEOUT_SECONDS,
      expiration: { maxEntries: 32, maxAgeSeconds: DAY },
    },
  },
  {
    // Also covers the PWA start URL. next-pwa's own start-url route is
    // suppressed below so that "/" lands here and inherits the timeout.
    urlPattern: ({ url, sameOrigin }) =>
      sameOrigin && !url.pathname.includes("/api/"),
    handler: "NetworkFirst",
    options: {
      cacheName: "pages",
      networkTimeoutSeconds: PAGE_NETWORK_TIMEOUT_SECONDS,
      expiration: { maxEntries: 32, maxAgeSeconds: DAY },
    },
  },
  {
    urlPattern: ({ sameOrigin }) => !sameOrigin,
    handler: "NetworkFirst",
    options: {
      cacheName: "cross-origin",
      networkTimeoutSeconds: 10,
      expiration: { maxEntries: 32, maxAgeSeconds: 60 * 60 },
    },
  },
];

export const pwaOptions = {
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: true,
  cacheOnFrontEndNav: true,
  // next-pwa injects its own start-url route: NetworkFirst with no timeout,
  // on the one URL an installed PWA always opens. It is not expressible through
  // runtimeCaching, so it has to be switched off here.
  //
  // Verified against the built sw.js: `cacheStartUrl: false` alone does NOT
  // remove it — `dynamicStartUrl: false` is what does. Both are set so that
  // neither a cached start URL nor a precached "/" comes back. With the route
  // gone, "/" falls through to the bounded "pages" rule above.
  // scripts/verify-service-worker.mjs fails the build if it returns.
  cacheStartUrl: false,
  dynamicStartUrl: false,
  // Last resort: a navigation that neither reached the network nor found a
  // cached copy renders this instead of the browser's error page.
  fallbacks: { document: "/offline" },
  workboxOptions: { disableDevLogs: true, runtimeCaching },
};

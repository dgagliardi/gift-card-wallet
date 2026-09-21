// Post-build assertions against the GENERATED service worker.
//
// lib/pwa-runtime-caching.test.ts checks the config we hand to next-pwa. That
// is not the same thing as what next-pwa emits: next-pwa injects routes of its
// own, and its `cacheStartUrl: false` alone did not suppress the unbounded
// `start-url` route — only `dynamicStartUrl: false` did. A config-level test
// cannot see that. This one reads public/sw.js and fails the build if an
// unbounded NetworkFirst route reappears.
//
// Run after `pnpm build`.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const swPath = path.join(appRoot, "public", "sw.js");

let sw;
try {
  sw = readFileSync(swPath, "utf8");
} catch {
  assert.fail(`No service worker at ${swPath}. Run \`pnpm build\` first.`);
}

/**
 * Every NetworkFirst route must cap how long it waits. Without a cap, a
 * request that stalls on weak signal never settles and the cached response is
 * never served — the app hangs instead of falling back.
 */
const unbounded = [];
for (const match of sw.matchAll(/NetworkFirst\(\{(.*?)plugins:/gs)) {
  const options = match[1];
  if (!options.includes("networkTimeoutSeconds:")) {
    const name = options.match(/cacheName:"([^"]+)"/)?.[1] ?? "(unnamed)";
    unbounded.push(name);
  }
}
assert.deepEqual(
  unbounded,
  [],
  `NetworkFirst routes with no networkTimeoutSeconds: ${unbounded.join(", ")}. ` +
    "These hang on a weak connection instead of serving the cached copy.",
);

// next-pwa's own start-url route is NetworkFirst with no timeout and is not
// expressible through runtimeCaching, so it has to be absent entirely. "/" is
// then handled by our bounded "pages" rule.
assert.ok(
  !sw.includes('cacheName:"start-url"'),
  'next-pwa re-added its unbounded "start-url" route. Check dynamicStartUrl/cacheStartUrl in lib/pwa-runtime-caching.mjs.',
);

// Card images must win over the generic image rule, which would otherwise pin
// them to a 64-entry budget shared with app chrome.
const cardImages = sw.indexOf('cacheName:"card-images"');
const staticImages = sw.indexOf('cacheName:"static-image-assets"');
const apis = sw.indexOf('cacheName:"apis"');
assert.ok(cardImages !== -1, 'No "card-images" route in the service worker.');
assert.ok(
  cardImages < staticImages && cardImages < apis,
  "The card-images route must be registered before static-image-assets and apis; Workbox takes the first match.",
);

assert.ok(
  sw.includes('url:"/offline"'),
  "The /offline fallback is not precached, so a cold navigation with no network shows a browser error page.",
);

console.log(
  "Service worker OK: no unbounded NetworkFirst route, no start-url route, card-images prioritised, /offline precached.",
);

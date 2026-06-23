import type { MetadataRoute } from "next";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

export default function manifest(): MetadataRoute.Manifest {
  const root = basePath || "/";

  return {
    name: "Gift Card Wallet",
    short_name: "Wallet",
    description: "Track gift cards and store credits.",
    start_url: root,
    scope: root,
    display: "standalone",
    background_color: "#f4f4f9",
    theme_color: "#0d9488",
    icons: [
      {
        src: `${basePath}/icons/icon-192.svg`,
        sizes: "192x192",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: `${basePath}/icons/icon-192.svg`,
        sizes: "192x192",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}

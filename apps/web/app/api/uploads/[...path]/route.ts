import fs from "node:fs";
import path from "node:path";
import { getSession } from "@/lib/session";
import { getUploadsRoot } from "@/lib/paths";

export async function GET(
  _request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  const session = await getSession();
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { path: segments } = await context.params;
  const rel = segments.join("/");
  if (!rel.startsWith(`${session.user.id}/`)) {
    return new Response("Forbidden", { status: 403 });
  }

  const root = path.resolve(getUploadsRoot());
  const full = path.resolve(path.join(root, rel));
  if (!full.startsWith(root + path.sep) && full !== root) {
    return new Response("Forbidden", { status: 403 });
  }

  if (!fs.existsSync(full) || !fs.statSync(full).isFile()) {
    return new Response("Not found", { status: 404 });
  }

  const buf = fs.readFileSync(full);
  const ext = path.extname(full).toLowerCase();
  const type =
    ext === ".png"
      ? "image/png"
      : ext === ".webp"
        ? "image/webp"
        : ext === ".gif"
          ? "image/gif"
          : "image/jpeg";

  return new Response(buf, {
    headers: {
      "Content-Type": type,
      "Cache-Control": "private, max-age=3600",
    },
  });
}

import fs from "node:fs";
import path from "node:path";

export function getUploadsRoot() {
  const root =
    process.env.UPLOADS_PATH ||
    path.join(process.cwd(), "data", "uploads");
  fs.mkdirSync(root, { recursive: true });
  return root;
}

export function userUploadDir(userId: string) {
  const dir = path.join(getUploadsRoot(), userId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

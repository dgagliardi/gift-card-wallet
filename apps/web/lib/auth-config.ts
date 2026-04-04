/** Shared flags for server + client (import only constants, no secrets). */
export function hasGoogleOAuth() {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
  );
}

export function emailPasswordEnabled() {
  if (process.env.ENABLE_EMAIL_PASSWORD === "true") return true;
  return !hasGoogleOAuth();
}

export const SITE_AUTH_COOKIE = "sp-site-auth";

export function sitePassword(): string {
  return process.env.SITE_PASSWORD?.trim() || "";
}

export function siteAuthEnabled(): boolean {
  return sitePassword().length > 0;
}

function authSecret(): string {
  return (
    process.env.AUTH_SECRET?.trim() ||
    process.env.BOT_API_KEY?.trim() ||
    "systempulse-site-auth"
  );
}

export async function expectedAuthToken(): Promise<string> {
  const data = new TextEncoder().encode(`${sitePassword()}:${authSecret()}`);
  const hash = await crypto.subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(hash);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

export async function isValidAuthToken(token: string | undefined): Promise<boolean> {
  if (!siteAuthEnabled()) return true;
  if (!token) return false;
  return token === (await expectedAuthToken());
}

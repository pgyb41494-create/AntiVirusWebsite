/** Railway API — browser uses same-origin /api proxy via next.config rewrites. */
export const DEFAULT_API_URL = "https://antivirusapi-production.up.railway.app";

export function getApiUrl(): string {
  // Client: relative paths hit Vercel rewrite → Railway (no CORS).
  if (typeof window !== "undefined") {
    return "";
  }
  const fromEnv = process.env.NEXT_PUBLIC_API_URL?.trim();
  return (fromEnv || DEFAULT_API_URL).replace(/\/$/, "");
}

export async function apiFetch(path: string, options: RequestInit = {}) {
  const base = getApiUrl();
  const res = await fetch(`${base}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  if (!res.ok) {
    throw new Error(`API ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

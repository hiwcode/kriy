export async function checkBackendHealth(): Promise<boolean> {
  try {
    // Same-origin route (see app/api/ready/route.ts) so ad blockers /
    // privacy shields never block it; the server proxies to the backend.
    const res = await fetch("/api/ready", { method: "GET", cache: "no-store" });
    const data = await res.json().catch(() => null);
    return data?.success === true;
  } catch {
    return false;
  }
}

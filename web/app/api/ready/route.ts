import { NextResponse } from "next/server";

// Server-side proxy for the backend health check. The browser calls this
// same-origin route (first-party, so ad blockers / privacy shields never
// block it), and Next.js fetches the backend from the server where no
// client-side blocker exists. See backend-health-provider.tsx.

// Prefer a server-only var, fall back to the public one used elsewhere.
const API_BASE_URL =
  process.env.API_BASE_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  "http://localhost:8000";

// Never cache — this reflects live backend state.
export const dynamic = "force-dynamic";

export async function GET() {
  const url = `${API_BASE_URL.replace(/\/$/, "")}/health`;
  try {
    const res = await fetch(url, {
      method: "GET",
      cache: "no-store",
      // Don't hang the readiness gate if the backend is slow/starting.
      signal: AbortSignal.timeout(5000),
    });
    const data = await res.json().catch(() => null);
    return NextResponse.json({ success: data?.success === true });
  } catch {
    return NextResponse.json({ success: false });
  }
}

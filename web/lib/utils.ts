import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Safely coerce extra_fields to a Record; avoids spreading strings (which produces char indices). */
export function ensureExtraFields(obj: unknown): Record<string, unknown> {
  if (obj != null && typeof obj === "object" && !Array.isArray(obj)) {
    const rec = obj as Record<string, unknown>;
    const keys = Object.keys(rec);
    if (keys.length > 10) {
      const numericKeys = keys.filter((k) => /^\d+$/.test(k));
      if (numericKeys.length === keys.length) {
        const sorted = [...numericKeys].sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
        const joined = sorted.map((k) => String(rec[k] ?? "")).join("");
        try {
          const p = JSON.parse(joined);
          return p && typeof p === "object" && !Array.isArray(p) ? p : {};
        } catch {
          return {};
        }
      }
    }
    return rec;
  }
  if (typeof obj === "string") {
    try {
      const p = JSON.parse(obj);
      return p && typeof p === "object" && !Array.isArray(p) ? p : {};
    } catch {
      return {};
    }
  }
  return {};
}

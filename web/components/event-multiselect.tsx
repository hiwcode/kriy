"use client";

import Link from "next/link";

/** Checkbox list for picking one or more event types (from the Events registry). */
export function EventMultiSelect({
  options,
  selected,
  onToggle,
}: {
  options: string[];
  selected: Set<string>;
  onToggle: (event: string) => void;
}) {
  if (options.length === 0) {
    return (
      <p className="rounded-lg border border-dashed px-3 py-3 text-xs text-muted-foreground">
        No events registered yet — add some on the{" "}
        <Link href="/events" className="text-primary underline underline-offset-2">Event catalog</Link>.
      </p>
    );
  }
  return (
    <div className="max-h-44 space-y-1 overflow-y-auto rounded-lg border p-2">
      {options.map((ev) => (
        <label key={ev} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent">
          <input type="checkbox" className="size-4" checked={selected.has(ev)} onChange={() => onToggle(ev)} />
          <code className="font-mono text-xs">{ev}</code>
        </label>
      ))}
    </div>
  );
}

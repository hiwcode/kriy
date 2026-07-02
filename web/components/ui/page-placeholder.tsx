"use client";

import { Construction } from "lucide-react";
import { usePathname } from "next/navigation";

export function PagePlaceholder() {
  const pathname = usePathname();
  const pageName = pathname
    .split("/")
    .pop()
    ?.split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

  return (
    <div className="flex min-h-[calc(100vh-10rem)] flex-col items-center justify-center">
      <div className="text-center">
        {/* Icon */}
        <div className="mx-auto mb-6 flex size-20 items-center justify-center rounded-2xl bg-muted/50">
          <Construction className="size-10 text-muted-foreground" />
        </div>

        {/* Title */}
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {pageName || "Page"} Coming Soon
        </h1>

        {/* Description */}
        <p className="mt-2 max-w-sm text-muted-foreground">
          This page is under construction. Check back later for updates.
        </p>

        {/* Path indicator */}
        <div className="mt-6">
          <code className="rounded-md bg-muted px-3 py-1.5 text-xs text-muted-foreground">
            {pathname}
          </code>
        </div>
      </div>
    </div>
  );
}

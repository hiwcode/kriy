"use client";

import * as React from "react";
import { GripVertical } from "lucide-react";

import { Sheet, SheetContent } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

/**
 * A right-side slide-over with a drag-to-resize left edge.
 *
 * Shared across the app so every drawer behaves and looks the same. Render the
 * drawer's own header/body as `children` (e.g. a header bar + scrollable content).
 *
 * `lockClose` keeps the drawer open on outside-click / Escape — use it only for
 * surfaces where an accidental dismiss would lose work (e.g. an active chat run).
 * Provide your own close control (a button calling `onOpenChange(false)`).
 */
export function ResizableDrawer({
  open,
  onOpenChange,
  children,
  defaultWidth = 560,
  minWidth = 420,
  lockClose = false,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
  defaultWidth?: number;
  minWidth?: number;
  lockClose?: boolean;
  className?: string;
}) {
  const [width, setWidth] = React.useState(defaultWidth);
  const resizingRef = React.useRef(false);

  React.useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!resizingRef.current) return;
      const w = window.innerWidth - e.clientX;
      setWidth(Math.min(Math.max(w, minWidth), window.innerWidth - 64));
    };
    const onUp = () => {
      if (!resizingRef.current) return;
      resizingRef.current = false;
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [minWidth]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        showCloseButton={false}
        onInteractOutside={lockClose ? (e) => e.preventDefault() : undefined}
        onEscapeKeyDown={lockClose ? (e) => e.preventDefault() : undefined}
        className={cn("flex !max-w-none flex-col gap-0 p-0", className)}
        style={{ width }}
      >
        {/* drag-to-resize handle */}
        <div
          onMouseDown={() => {
            resizingRef.current = true;
            document.body.style.userSelect = "none";
            document.body.style.cursor = "col-resize";
          }}
          className="group/resize absolute left-0 top-0 z-50 flex h-full w-2 -translate-x-1/2 cursor-col-resize items-center justify-center"
          title="Drag to resize"
        >
          <span className="h-full w-px bg-border transition-colors group-hover/resize:bg-primary" />
          <span className="absolute flex h-10 w-4 items-center justify-center rounded-full border bg-card opacity-0 shadow-sm transition-opacity group-hover/resize:opacity-100">
            <GripVertical className="size-3 text-muted-foreground" />
          </span>
        </div>

        {children}
      </SheetContent>
    </Sheet>
  );
}

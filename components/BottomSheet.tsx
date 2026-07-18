"use client";

import { X } from "@phosphor-icons/react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";

// Thin wrapper over shadcn's Sheet so callers keep the pre-shadcn open/onClose API.
// Bottom sheet on mobile; on sm+ it becomes a vertically centered modal via
// inset-0 + m-auto + h-fit (no translate centering, which would fight the slide-in
// animation's transforms). The `!` overrides are needed because SheetContent's own
// data-[side=bottom] positioning utilities would otherwise win the cascade.
// showCloseButton is always off here -- every piece of content renders its own
// ModalHeader (below) instead, so the close button sits in line with the title rather
// than floating unaligned in the corner.
export function BottomSheet({
  open,
  onClose,
  children,
  widthClassName = "sm:max-w-md",
  heightClassName = "max-h-[85vh] sm:h-fit!",
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  widthClassName?: string;
  heightClassName?: string;
}) {
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className={`gap-0 overflow-y-auto rounded-t-2xl p-5 sm:inset-0! sm:m-auto! sm:w-full sm:rounded-2xl ${widthClassName} ${heightClassName}`}
      >
        <SheetTitle className="sr-only">Panel</SheetTitle>
        {children}
      </SheetContent>
    </Sheet>
  );
}

// Standard header for every BottomSheet: title on the left, close button pinned to the
// far right, both vertically centered on one row. `title` is a node (not just a string)
// since some callers need more than plain text (e.g. Header's mobile menu combines the
// wordmark with the destination switcher) -- callers own their own title styling
// (typically `text-lg font-semibold`) and any bottom margin via `className`, since some
// sit inside an already-gapped flex-col (no margin needed) and some don't.
export function ModalHeader({
  title,
  onClose,
  className = "",
}: {
  title: React.ReactNode;
  onClose: () => void;
  className?: string;
}) {
  return (
    <div className={`flex items-center justify-between gap-3 ${className}`}>
      <div className="min-w-0 flex-1">{title}</div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-black/50 hover:bg-black/[.06] hover:text-black/80 dark:text-white/50 dark:hover:bg-white/[.08] dark:hover:text-white/80"
      >
        <X size={16} weight="bold" />
      </button>
    </div>
  );
}

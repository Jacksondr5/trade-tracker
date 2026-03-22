"use client";

import { Loader2, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "~/lib/utils";

interface ConfirmDeleteButtonProps {
  dataTestId: string;
  tooltipTestId: string;
  disabled?: boolean;
  isDeleting?: boolean;
  onConfirm: () => void | Promise<void>;
  className?: string;
}

export function ConfirmDeleteButton({
  dataTestId,
  tooltipTestId,
  disabled = false,
  isDeleting = false,
  onConfirm,
  className,
}: ConfirmDeleteButtonProps) {
  const [isArmed, setIsArmed] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const disarm = useCallback(() => {
    setIsArmed(false);
  }, []);

  useEffect(() => {
    if (!isArmed) return;

    function handlePointerDown(e: PointerEvent) {
      if (buttonRef.current && !buttonRef.current.contains(e.target as Node)) {
        disarm();
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [isArmed, disarm]);

  // Reset armed state when deletion completes
  useEffect(() => {
    if (!isDeleting) {
      setIsArmed(false);
    }
  }, [isDeleting]);

  const handleClick = () => {
    if (isDeleting || disabled) return;

    if (isArmed) {
      onConfirm();
    } else {
      setIsArmed(true);
    }
  };

  return (
    <span className="relative inline-flex">
      {isArmed && (
        <span
          className="absolute bottom-full left-1/2 mb-1.5 -translate-x-1/2 rounded border border-olive-6 bg-olive-3 px-2 py-1 text-xs font-medium whitespace-nowrap text-red-9 shadow-sm"
          data-testid={tooltipTestId}
          role="tooltip"
        >
          Click again to delete
        </span>
      )}
      <button
        ref={buttonRef}
        type="button"
        aria-label={isArmed ? "Click again to delete" : "Delete"}
        title={isArmed ? undefined : "Delete"}
        className={cn(
          "rounded p-1 text-olive-10 transition-colors disabled:opacity-50",
          isArmed
            ? "bg-red-3 text-red-9 hover:bg-red-4"
            : "hover:bg-olive-4 hover:text-red-9",
          className,
        )}
        data-testid={dataTestId}
        disabled={disabled || isDeleting}
        onClick={handleClick}
      >
        {isDeleting ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Trash2 className="h-3.5 w-3.5" />
        )}
      </button>
    </span>
  );
}

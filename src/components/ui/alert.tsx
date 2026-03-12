"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { X } from "lucide-react";
import { cn } from "~/lib/utils";

const alertVariants = cva(
  "flex items-center justify-between rounded-md border px-4 py-3 text-sm",
  {
    variants: {
      variant: {
        success: "border-grass-8 bg-grass-3/60 text-grass-12",
        error: "border-red-8 bg-red-3/60 text-red-12",
        warning: "border-amber-8 bg-amber-3/60 text-amber-12",
        info: "border-blue-8 bg-blue-3/60 text-blue-12",
      },
    },
    defaultVariants: {
      variant: "info",
    },
  },
);

export interface AlertProps
  extends
    React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof alertVariants> {
  onDismiss?: () => void;
}

function Alert({
  className,
  variant,
  children,
  onDismiss,
  ...props
}: AlertProps) {
  return (
    <div
      role="alert"
      className={cn(alertVariants({ variant }), className)}
      {...props}
    >
      <span>{children}</span>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="ml-4 shrink-0 opacity-70 hover:opacity-100"
          aria-label="Dismiss alert"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

export { Alert, alertVariants };

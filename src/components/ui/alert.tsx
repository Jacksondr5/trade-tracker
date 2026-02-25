"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "~/lib/utils";

const alertVariants = cva(
  "flex items-center justify-between rounded-md border px-4 py-3 text-sm",
  {
    variants: {
      variant: {
        success: "border-green-700 bg-green-900/50 text-green-200",
        error: "border-red-700 bg-red-900/50 text-red-200",
        warning: "border-amber-700 bg-amber-900/50 text-amber-200",
        info: "border-blue-700 bg-blue-900/50 text-blue-200",
      },
    },
    defaultVariants: {
      variant: "info",
    },
  },
);

export interface AlertProps
  extends React.HTMLAttributes<HTMLDivElement>,
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
          aria-label="Dismiss"
        >
          ✕
        </button>
      )}
    </div>
  );
}

export { Alert, alertVariants };

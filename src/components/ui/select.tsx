"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { ChevronDown } from "lucide-react";
import { cn } from "~/lib/utils";

const selectVariants = {
  error: {
    true: "border-red-7 text-red-11 focus-visible:ring-red-7/50",
    false: "",
  },
  size: {
    default: "h-9 px-3 py-1 text-sm",
    sm: "h-8 px-2 py-1 text-xs",
    lg: "h-12 px-4 py-2 text-base",
  },
};

const selectClassName = cva(
  "flex w-full appearance-none rounded-md border border-olive-7 bg-transparent pr-8 text-slate-12 transition-colors focus-visible:ring-2 focus-visible:ring-blue-8 focus-visible:ring-offset-2 focus-visible:ring-offset-olive-1 focus-visible:outline-hidden disabled:cursor-not-allowed disabled:opacity-50",
  {
    variants: selectVariants,
    defaultVariants: {
      error: false,
      size: "default",
    },
  },
);

const iconClassName = cva(
  "pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-olive-11",
  {
    variants: {
      size: {
        default: "size-4",
        sm: "size-3.5",
        lg: "size-[1.125rem]",
      },
    },
    defaultVariants: {
      size: "default",
    },
  },
);

export interface SelectProps
  extends
    Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "size">,
    VariantProps<typeof selectClassName> {
  dataTestId: string;
  error?: boolean;
}

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, dataTestId, error, size, ...props }, ref) => {
    return (
      <div className="relative w-full">
        <select
          ref={ref}
          data-slot="select"
          data-testid={dataTestId}
          className={cn(selectClassName({ error, size, className }))}
          {...props}
        />
        <ChevronDown
          aria-hidden="true"
          className={cn(iconClassName({ size }))}
        />
      </div>
    );
  },
);

Select.displayName = "Select";

export { Select, selectClassName, selectVariants };

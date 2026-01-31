"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";

import { cn } from "~/lib/utils";

export const buttonVariants = {
  variant: {
    default: "bg-grass-9 text-grass-1 hover:bg-grass-10 rounded-md",
    destructive:
      "bg-red-9 text-red-1 hover:bg-red-10 focus-visible:ring-red-7 rounded-md",
    outline:
      "border-olive-7 text-slate-11 hover:bg-olive-4 hover:text-slate-12 rounded-md border bg-transparent",
    secondary: "bg-olive-3 text-slate-11 hover:bg-olive-4 rounded-md",
    ghost: "text-slate-11 hover:bg-olive-3 hover:text-slate-12 rounded-md",
    link: "text-blue-9 hover:text-blue-10 underline-offset-4 hover:underline",
  },
  size: {
    default: "h-10 px-4 py-2",
    sm: "h-8 px-3 py-1.5 text-xs",
    lg: "h-12 px-6 py-3 text-lg",
    icon: "size-10 rounded-md",
  },
};

export const buttonClassName = cva(
  "focus-visible:ring-offset-olive-1 focus-visible:ring-blue-8 aria-invalid:ring-red-7/40 aria-invalid:border-red-7 inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap font-sans font-medium outline-none transition-all focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: buttonVariants,
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ComponentProps<"button">,
    VariantProps<typeof buttonClassName> {
  asChild?: boolean;
  isLoading?: boolean;
  dataTestId: string;
}

function Button({
  className,
  variant,
  size,
  asChild = false,
  isLoading = false,
  children,
  disabled,
  dataTestId,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      data-slot="button"
      data-testid={dataTestId}
      className={cn(buttonClassName({ variant, size, className }), {
        "cursor-not-allowed opacity-70": isLoading,
      })}
      disabled={disabled || isLoading}
      {...props}
    >
      <>
        {isLoading && (
          <Loader2
            className="mr-2 size-4 animate-spin"
            data-slot="button-loader"
          />
        )}
        {children}
      </>
    </Comp>
  );
}

export { Button };

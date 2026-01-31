import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "~/lib/utils";

const inputBaseClasses =
  "border-olive-7 shadow-xs file:text-olive-11 placeholder:text-olive-11 text-slate-12 focus-visible:ring-olive-7 focus-visible:outline-hidden flex w-full rounded-md border bg-transparent text-base transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium focus-visible:ring-1 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm";

export const inputVariants = {
  error: {
    true: "border-red-7 focus-visible:ring-red-7/50 text-red-11 placeholder:text-red-9",
    false: "",
  },
  size: {
    default: "h-9 py-1 text-base",
    sm: "h-8 py-1 text-xs",
    lg: "h-12 py-2 text-lg",
  },
  layout: {
    none: "",
    iconLeft: "",
    iconRight: "",
  },
};

const inputCva = cva(inputBaseClasses, {
  variants: inputVariants,
  compoundVariants: [
    { size: "default", layout: "none", className: "px-3" },
    { size: "sm", layout: "none", className: "px-2" },
    { size: "lg", layout: "none", className: "px-4" },
    { size: "default", layout: "iconLeft", className: "pl-9 pr-3" },
    { size: "sm", layout: "iconLeft", className: "pl-7 pr-2" },
    { size: "lg", layout: "iconLeft", className: "pl-10 pr-4" },
    { size: "default", layout: "iconRight", className: "pl-3 pr-9" },
    { size: "sm", layout: "iconRight", className: "pl-2 pr-7" },
    { size: "lg", layout: "iconRight", className: "pl-4 pr-10" },
  ],
  defaultVariants: {
    size: "default",
    layout: "none",
    error: false,
  },
});

const iconContainerCva = cva(
  "text-muted-foreground peer-focus:text-foreground absolute top-1/2 flex -translate-y-1/2 items-center justify-center",
  {
    variants: {
      position: {
        left: "",
        right: "",
      },
      size: {
        default: "",
        sm: "",
        lg: "",
      },
    },
    compoundVariants: [
      { position: "left", size: "default", className: "left-2.5" },
      { position: "left", size: "sm", className: "left-2" },
      { position: "left", size: "lg", className: "left-3" },
      { position: "right", size: "default", className: "right-2.5" },
      { position: "right", size: "sm", className: "right-2" },
      { position: "right", size: "lg", className: "right-3" },
    ],
    defaultVariants: {
      position: "left",
      size: "default",
    },
  },
);

const inputWrapperCva = cva("relative flex w-full items-center", {
  variants: {
    disabled: {
      true: "cursor-not-allowed opacity-50",
    },
  },
});

export interface InputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size">,
    VariantProps<typeof inputCva> {
  dataTestId: string;
  error?: boolean;
  icon?: React.ReactNode;
  iconPosition?: "left" | "right";
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      className,
      type,
      size,
      icon,
      iconPosition = "left",
      error,
      dataTestId,
      ...props
    },
    ref,
  ) => {
    const hasIcon = Boolean(icon);
    const layoutVariant = hasIcon
      ? iconPosition === "left"
        ? "iconLeft"
        : "iconRight"
      : "none";

    if (hasIcon) {
      return (
        <div
          className={cn(
            inputWrapperCva({ disabled: props.disabled }),
          )}
        >
          <div
            className={cn(iconContainerCva({ position: iconPosition, size }))}
          >
            {icon}
          </div>
          <input
            type={type}
            data-slot="input"
            data-testid={dataTestId}
            className={cn(
              inputCva({ size, layout: layoutVariant, error }),
              className,
            )}
            ref={ref}
            {...props}
          />
        </div>
      );
    }

    return (
      <input
        type={type}
        data-slot="input"
        data-testid={dataTestId}
        className={cn(inputCva({ size, layout: "none", error }), className)}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };

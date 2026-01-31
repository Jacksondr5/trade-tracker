"use client";

import * as React from "react";
import * as LabelPrimitive from "@radix-ui/react-label";

import { cn } from "~/lib/utils";

interface LabelProps extends React.ComponentProps<typeof LabelPrimitive.Root> {
  dataTestId: string;
  error?: boolean;
}

function Label({ className, dataTestId, error, ...props }: LabelProps) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      data-testid={dataTestId}
      className={cn(
        "select-none font-sans text-base font-normal leading-none",
        error ? "text-red-11" : "text-slate-11",
        "group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50",
        "peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export { Label };

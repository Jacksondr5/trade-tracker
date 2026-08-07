"use client";

import * as React from "react";
import { useFieldContext } from "./form-contexts";
import { FormErrorMessage } from "./form-error-message";
import { Input, InputProps } from "./input";
import { Label } from "./label";
import { cn } from "~/lib/utils";

export const FieldInput = ({
  label,
  labelAction,
  className,
  dataTestId,
  displayValue,
  ...props
}: Omit<
  InputProps,
  "value" | "onChange" | "onBlur" | "aria-invalid" | "dataTestId"
> & {
  dataTestId?: string;
  displayValue?: string;
  label: string;
  labelAction?: React.ReactNode;
}) => {
  const errorId = React.useId();
  const field = useFieldContext<string>();
  const hasError = field.state.meta.errors.length > 0;
  return (
    <div className={cn("grid w-full items-center gap-1.5", className)}>
      <div className="flex min-h-5 items-center justify-between gap-2">
        <Label
          htmlFor={field.name}
          dataTestId={`${field.name}-label`}
          error={hasError}
        >
          {label}
        </Label>
        {labelAction}
      </div>
      <Input
        {...props}
        id={field.name}
        dataTestId={dataTestId ?? `${field.name}-input`}
        value={displayValue ?? field.state.value ?? ""}
        onChange={(e) => field.handleChange(e.target.value)}
        onBlur={field.handleBlur}
        aria-invalid={hasError}
        aria-describedby={hasError ? errorId : undefined}
        error={hasError}
      />
      {hasError && (
        <FormErrorMessage
          id={errorId}
          dataTestId={`${field.name}-error`}
          messages={field.state.meta.errors as string[]}
        />
      )}
    </div>
  );
};

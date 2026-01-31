"use client";

import * as React from "react";
import { useFieldContext } from "./form-contexts";
import { FormErrorMessage } from "./form-error-message";
import { Input, InputProps } from "./input";
import { Label } from "./label";
import { cn } from "~/lib/utils";

export const FieldInput = ({
  label,
  className,
  ...props
}: Omit<
  InputProps,
  "value" | "onChange" | "onBlur" | "aria-invalid" | "dataTestId"
> & {
  label: string;
}) => {
  const errorId = React.useId();
  const field = useFieldContext<string>();
  const hasError = field.state.meta.errors.length > 0;
  return (
    <div className={cn("grid w-full items-center gap-1.5", className)}>
      <Label
        htmlFor={field.name}
        dataTestId={`${field.name}-label`}
        error={hasError}
      >
        {label}
      </Label>
      <Input
        {...props}
        id={field.name}
        dataTestId={`${field.name}-input`}
        value={field.state.value || ""}
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

"use client";

import * as React from "react";
import { Textarea, TextareaProps } from "./textarea";
import { FormErrorMessage } from "./form-error-message";
import { useFieldContext } from "./form-contexts";
import { Label } from "./label";
import { cn } from "~/lib/utils";

export const FieldTextarea = ({
  label,
  className,
  ...props
}: Omit<
  TextareaProps,
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
      <Textarea
        {...props}
        id={field.name}
        value={field.state.value || ""}
        onChange={(e) => field.handleChange(e.target.value)}
        onBlur={field.handleBlur}
        aria-invalid={hasError}
        aria-describedby={hasError ? errorId : undefined}
        error={hasError}
        dataTestId={`${field.name}-textarea`}
      />
      {hasError && (
        <FormErrorMessage
          id={errorId}
          messages={field.state.meta.errors as string[]}
          dataTestId={`${field.name}-error`}
        />
      )}
    </div>
  );
};

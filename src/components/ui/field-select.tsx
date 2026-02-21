"use client";

import * as React from "react";
import { cn } from "~/lib/utils";
import { useFieldContext } from "./form-contexts";
import { FormErrorMessage } from "./form-error-message";
import { Label } from "./label";

export interface FieldSelectOption {
  label: string;
  value: string;
}

export const FieldSelect = ({
  className,
  label,
  options,
  placeholder,
}: {
  className?: string;
  label: string;
  options: FieldSelectOption[];
  placeholder?: string;
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
      <select
        id={field.name}
        data-testid={`${field.name}-select`}
        value={field.state.value || ""}
        onChange={(e) => field.handleChange(e.target.value)}
        onBlur={field.handleBlur}
        aria-invalid={hasError}
        aria-describedby={hasError ? errorId : undefined}
        className={cn(
          "text-slate-12 h-9 w-full rounded-md border bg-slate-700 px-3 py-1 text-sm focus:outline-none focus:ring-1",
          hasError
            ? "border-red-700 focus:ring-red-700/50"
            : "border-slate-600 focus:ring-slate-500",
        )}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
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

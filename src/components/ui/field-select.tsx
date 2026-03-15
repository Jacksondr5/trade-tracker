"use client";

import * as React from "react";
import { cn } from "~/lib/utils";
import { useFieldContext } from "./form-contexts";
import { FormErrorMessage } from "./form-error-message";
import { Label } from "./label";
import { Select, type SelectProps } from "./select";

export interface FieldSelectOption {
  label: string;
  value: string;
}

export const FieldSelect = ({
  className,
  label,
  options,
  placeholder,
  ...props
}: Omit<
  SelectProps,
  | "aria-describedby"
  | "aria-invalid"
  | "dataTestId"
  | "onBlur"
  | "onChange"
  | "value"
> & {
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
      <Select
        {...props}
        id={field.name}
        dataTestId={`${field.name}-select`}
        value={field.state.value || ""}
        onChange={(e) => field.handleChange(e.target.value)}
        onBlur={field.handleBlur}
        aria-invalid={hasError}
        aria-describedby={hasError ? errorId : undefined}
        error={hasError}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
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

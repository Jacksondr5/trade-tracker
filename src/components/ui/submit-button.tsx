"use client";

import { useFormContext } from "./form-contexts";
import { Button } from "./button";
import type { ButtonProps } from "./button";

function SubmitButton({
  className,
  dataTestId,
  label,
  size,
  variant,
}: {
  className?: string;
  dataTestId?: string;
  label: string;
  size?: ButtonProps["size"];
  variant?: ButtonProps["variant"];
}) {
  const form = useFormContext();
  return (
    <form.Subscribe selector={(state) => [state.isSubmitting, state.canSubmit]}>
      {([isSubmitting, canSubmit]) => (
        <Button
          className={className}
          isLoading={isSubmitting}
          disabled={!canSubmit}
          size={size}
          type="submit"
          variant={variant}
          dataTestId={dataTestId ?? "submit-button"}
        >
          {label}
        </Button>
      )}
    </form.Subscribe>
  );
}

export { SubmitButton };

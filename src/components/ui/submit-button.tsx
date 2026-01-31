"use client";

import { useFormContext } from "./form-contexts";
import { Button } from "./button";

function SubmitButton({ label }: { label: string }) {
  const form = useFormContext();
  return (
    <form.Subscribe selector={(state) => [state.isSubmitting, state.canSubmit]}>
      {([isSubmitting, canSubmit]) => (
        <Button
          isLoading={isSubmitting}
          disabled={!canSubmit}
          type="submit"
          dataTestId="submit-button"
        >
          {label}
        </Button>
      )}
    </form.Subscribe>
  );
}

export { SubmitButton };

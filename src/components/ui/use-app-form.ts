"use client";

import { createFormHook } from "@tanstack/react-form";
import { fieldContext, formContext } from "./form-contexts";
import { FieldInput } from "./field-input";
import { FieldTextarea } from "./field-textarea";
import { SubmitButton } from "./submit-button";

export const { useAppForm } = createFormHook({
  fieldComponents: {
    FieldInput,
    FieldTextarea,
  },
  formComponents: {
    SubmitButton,
  },
  fieldContext,
  formContext,
});

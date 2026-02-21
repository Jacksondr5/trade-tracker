"use client";

import { createFormHook } from "@tanstack/react-form";
import { fieldContext, formContext } from "./form-contexts";
import { FieldInput } from "./field-input";
import { FieldSelect } from "./field-select";
import { FieldTextarea } from "./field-textarea";
import { SubmitButton } from "./submit-button";

export const { useAppForm } = createFormHook({
  fieldComponents: {
    FieldInput,
    FieldSelect,
    FieldTextarea,
  },
  formComponents: {
    SubmitButton,
  },
  fieldContext,
  formContext,
});

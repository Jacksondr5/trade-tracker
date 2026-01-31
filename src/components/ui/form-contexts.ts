"use client";

import { createFormHookContexts } from "@tanstack/react-form";

const { fieldContext, formContext, useFieldContext, useFormContext } =
  createFormHookContexts();

export { fieldContext, formContext, useFieldContext, useFormContext };

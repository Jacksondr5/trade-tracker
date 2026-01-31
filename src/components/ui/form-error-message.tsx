"use client";

import * as React from "react";
import { cn } from "~/lib/utils";

export interface FormErrorMessageProps
  extends React.HTMLAttributes<HTMLDivElement> {
  dataTestId: string;
  messages?: string[];
}

const FormErrorMessage = React.forwardRef<
  HTMLDivElement,
  FormErrorMessageProps
>(({ className, messages, id, dataTestId, ...props }, ref) => {
  if (!messages || messages.length === 0) {
    return null;
  }

  return (
    <div
      id={id}
      ref={ref}
      data-testid={dataTestId}
      className={cn("text-red-11 mt-1 text-sm", className)}
      {...props}
      role="alert"
    >
      {messages.map((message, index) => (
        <p key={index}>{message}</p>
      ))}
    </div>
  );
});
FormErrorMessage.displayName = "FormErrorMessage";

export { FormErrorMessage };

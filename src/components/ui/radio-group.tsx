"use client";

import * as React from "react";
import { useContext } from "react";
import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
import { CircleIcon } from "lucide-react";

import { cn } from "~/lib/utils";

interface RadioGroupContextValue {
  dataTestId: string;
}

const RadioGroupContext = React.createContext<RadioGroupContextValue | null>(
  null,
);

const useRadioGroupContext = () => {
  const context = useContext(RadioGroupContext);
  if (!context) {
    throw new Error("RadioGroupItem must be used within a RadioGroup provider");
  }
  return context;
};

function RadioGroup({
  className,
  dataTestId,
  ...props
}: React.ComponentProps<typeof RadioGroupPrimitive.Root> & {
  dataTestId: string;
}) {
  return (
    <RadioGroupContext.Provider value={{ dataTestId }}>
      <RadioGroupPrimitive.Root
        data-slot="radio-group"
        data-testid={dataTestId}
        className={cn("grid gap-3", className)}
        {...props}
      />
    </RadioGroupContext.Provider>
  );
}

type RadioGroupItemProps = React.ComponentProps<
  typeof RadioGroupPrimitive.Item
>;

function RadioGroupItem({ className, ...props }: RadioGroupItemProps) {
  const { dataTestId } = useRadioGroupContext();
  const itemValue = props.value;
  return (
    <RadioGroupPrimitive.Item
      data-slot="radio-group-item"
      data-testid={`${dataTestId}-item-${itemValue}`}
      className={cn(
        "border-olive-7 bg-olive-3 aspect-square size-4 shrink-0 rounded-full border",
        "focus-visible:ring-blue-8/50 focus-visible:outline-none focus-visible:ring-2",
        "aria-checked:border-grass-9 aria-checked:bg-grass-9",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "aria-invalid:border-red-7",
        "transition-[color,box-shadow]",
        className,
      )}
      {...props}
    >
      <RadioGroupPrimitive.Indicator
        data-slot="radio-group-indicator"
        className="relative flex items-center justify-center"
      >
        <CircleIcon className="fill-grass-1 absolute left-1/2 top-1/2 size-2 -translate-x-1/2 -translate-y-1/2" />
      </RadioGroupPrimitive.Indicator>
    </RadioGroupPrimitive.Item>
  );
}

export { RadioGroup, RadioGroupItem };

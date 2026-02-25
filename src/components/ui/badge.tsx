import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "~/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium",
  {
    variants: {
      variant: {
        success: "border-green-700 bg-green-900/50 text-green-200",
        danger: "border-red-700 bg-red-900/50 text-red-200",
        info: "border-blue-700 bg-blue-900/50 text-blue-200",
        warning: "border-amber-700 bg-amber-900/50 text-amber-200",
        neutral: "border-slate-600 bg-slate-700/50 text-slate-300",
      },
    },
    defaultVariants: {
      variant: "neutral",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };

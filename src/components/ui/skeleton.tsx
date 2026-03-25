import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "~/lib/utils";

const skeletonVariants = cva("animate-pulse rounded", {
  variants: {
    surface: {
      working: "bg-olive-3",
      dense: "bg-slate-4",
    },
    height: {
      xs: "h-2",
      sm: "h-4",
      md: "h-5",
      lg: "h-6",
      xl: "h-9",
    },
  },
  defaultVariants: {
    surface: "working",
    height: "sm",
  },
});

export interface SkeletonProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof skeletonVariants> {
  dataTestId?: string;
}

function Skeleton({
  className,
  dataTestId,
  height,
  surface,
  ...props
}: SkeletonProps) {
  return (
    <div
      className={cn(skeletonVariants({ surface, height }), className)}
      data-testid={dataTestId}
      {...props}
    />
  );
}

export { Skeleton, skeletonVariants };

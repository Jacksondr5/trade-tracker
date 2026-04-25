import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "~/lib/utils";

export function PaginationControls({
  className,
  currentPage,
  isLoading = false,
  nextDisabled,
  nextTestId,
  onNext,
  onPrevious,
  previousDisabled,
  previousTestId,
}: {
  className?: string;
  currentPage: number;
  isLoading?: boolean;
  nextDisabled: boolean;
  nextTestId?: string;
  onNext: () => void;
  onPrevious: () => void;
  previousDisabled: boolean;
  previousTestId?: string;
}) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <button
        aria-label="Previous page"
        className="rounded border border-olive-6 p-1.5 text-slate-12 disabled:opacity-50"
        data-testid={previousTestId}
        disabled={previousDisabled || isLoading}
        onClick={onPrevious}
        title="Previous page"
        type="button"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <span className="whitespace-nowrap text-sm text-slate-11">
        Page {currentPage}
      </span>
      <button
        aria-label="Next page"
        className="rounded border border-olive-6 p-1.5 text-slate-12 disabled:opacity-50"
        data-testid={nextTestId}
        disabled={nextDisabled || isLoading}
        onClick={onNext}
        title="Next page"
        type="button"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}

"use client";

import { Star } from "lucide-react";
import { Button } from "~/components/ui";
import { cn } from "~/lib/utils";

export function WatchToggleButton({
  className,
  dataTestId,
  disabled = false,
  isWatched,
  itemName,
  onClick,
}: {
  className?: string;
  dataTestId: string;
  disabled?: boolean;
  isWatched: boolean;
  itemName: string;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      dataTestId={dataTestId}
      aria-label={
        isWatched
          ? `Remove ${itemName} from Watchlist`
          : `Add ${itemName} to Watchlist`
      }
      aria-pressed={isWatched}
      className={cn(
        "h-8 w-8 rounded-md text-olive-10 hover:bg-olive-4 hover:text-olive-12",
        className,
        isWatched && "text-amber-11 hover:text-amber-12",
      )}
      disabled={disabled}
      onClick={onClick}
    >
      <Star className={cn("h-4 w-4", isWatched && "fill-current")} />
    </Button>
  );
}

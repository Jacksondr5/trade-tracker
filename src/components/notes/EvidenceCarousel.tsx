"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "~/components/ui";

const MAX_VISIBLE_THUMBNAILS = 2;

export function EvidenceCarousel({ urls }: { urls: string[] }) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const visibleUrls = urls.slice(0, MAX_VISIBLE_THUMBNAILS);
  const overflowCount = urls.length - MAX_VISIBLE_THUMBNAILS;

  return (
    <>
      <div className="flex gap-2">
        {visibleUrls.map((url, i) => (
          <button
            key={i}
            type="button"
            className="flex-none cursor-pointer rounded focus-visible:ring-2 focus-visible:ring-olive-8 focus-visible:ring-offset-2 focus-visible:ring-offset-olive-2 focus-visible:outline-none"
            onClick={() => setLightboxIndex(i)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt={`Chart ${i + 1}`}
              className="h-20 w-20 rounded border border-olive-6 object-cover transition-opacity hover:opacity-80"
            />
          </button>
        ))}
        {overflowCount > 0 && (
          <button
            type="button"
            className="flex h-20 w-20 flex-none cursor-pointer items-center justify-center rounded border border-olive-6 text-xs text-olive-11 transition-colors hover:bg-olive-4 hover:text-olive-12 focus-visible:ring-2 focus-visible:ring-olive-8 focus-visible:ring-offset-2 focus-visible:ring-offset-olive-2 focus-visible:outline-none"
            onClick={() => setLightboxIndex(MAX_VISIBLE_THUMBNAILS)}
          >
            +{overflowCount} more
          </button>
        )}
      </div>

      {lightboxIndex !== null && (
        <EvidenceLightbox
          urls={urls}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </>
  );
}

function EvidenceLightbox({
  urls,
  initialIndex,
  onClose,
}: {
  urls: string[];
  initialIndex: number;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(initialIndex);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowLeft" && index > 0) {
        setIndex(index - 1);
      } else if (e.key === "ArrowRight" && index < urls.length - 1) {
        setIndex(index + 1);
      }
    },
    [index, urls.length],
  );

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className="flex max-h-[95dvh] max-w-[95dvw] items-center justify-center border-none bg-transparent p-0 shadow-none [&>button:last-child]:top-2 [&>button:last-child]:right-2 [&>button:last-child]:rounded-full [&>button:last-child]:bg-olive-1/80 [&>button:last-child]:p-2 [&>button:last-child]:opacity-100"
        onKeyDown={handleKeyDown}
      >
        <DialogTitle className="sr-only">
          Chart {index + 1} of {urls.length}
        </DialogTitle>
        {urls.length > 1 && index > 0 && (
          <button
            type="button"
            aria-label="Previous chart"
            className="absolute top-1/2 left-2 z-20 -translate-y-1/2 rounded-full bg-olive-1/80 p-2 text-olive-11 hover:text-olive-12 focus-visible:ring-2 focus-visible:ring-olive-8 focus-visible:ring-offset-2 focus-visible:ring-offset-olive-2 focus-visible:outline-none"
            onClick={() => setIndex(index - 1)}
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
        )}

        {urls.length > 1 && index < urls.length - 1 && (
          <button
            type="button"
            aria-label="Next chart"
            className="absolute top-1/2 right-2 z-20 -translate-y-1/2 rounded-full bg-olive-1/80 p-2 text-olive-11 hover:text-olive-12 focus-visible:ring-2 focus-visible:ring-olive-8 focus-visible:ring-offset-2 focus-visible:ring-offset-olive-2 focus-visible:outline-none"
            onClick={() => setIndex(index + 1)}
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        )}

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={urls[index]}
          alt={`Chart ${index + 1} of ${urls.length}`}
          className="max-h-[90dvh] max-w-[90dvw] rounded-lg object-contain"
        />

        {urls.length > 1 && (
          <div className="absolute bottom-4 flex gap-1.5">
            {urls.map((_, i) => (
              <button
                key={i}
                type="button"
                aria-label={`Go to chart ${i + 1}`}
                className={`h-2 w-2 rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-olive-8 focus-visible:ring-offset-2 focus-visible:ring-offset-olive-2 focus-visible:outline-none ${
                  i === index
                    ? "bg-olive-12"
                    : "bg-olive-11/40 hover:bg-olive-11/70"
                }`}
                onClick={() => setIndex(i)}
              />
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

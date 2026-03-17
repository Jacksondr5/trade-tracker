"use client";

import { LineChart, Trash2 } from "lucide-react";

export function EvidenceUrlInputs({
  urls,
  onChange,
}: {
  urls: string[];
  onChange: (urls: string[]) => void;
}) {
  const addUrl = () => onChange([...urls, ""]);
  const removeUrl = (index: number) =>
    onChange(urls.filter((_, i) => i !== index));
  const updateUrl = (index: number, value: string) =>
    onChange(urls.map((u, i) => (i === index ? value : u)));

  return (
    <div className="mt-2 space-y-2">
      {urls.map((url, i) => (
        <div key={i} className="space-y-1">
          <div className="flex gap-2">
            <input
              type="url"
              aria-label={`Chart URL ${i + 1}`}
              className="flex-1 rounded border border-olive-6 bg-olive-3 px-3 py-1.5 text-sm text-olive-12 placeholder:text-olive-10"
              placeholder="Chart image URL"
              value={url}
              onChange={(e) => updateUrl(i, e.target.value)}
            />
            <button
              type="button"
              aria-label={`Remove chart URL ${i + 1}`}
              title="Remove"
              className="rounded p-1.5 text-olive-11 hover:bg-olive-4 hover:text-red-9"
              onClick={() => removeUrl(i)}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
          {url.trim() && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={url.trim()}
              alt={`Chart preview ${i + 1}`}
              className="max-h-48 rounded border border-olive-6"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
              onLoad={(e) => {
                (e.target as HTMLImageElement).style.display = "block";
              }}
            />
          )}
        </div>
      ))}
      <button
        type="button"
        aria-label="Add chart image"
        title="Add chart image"
        className="rounded p-1.5 text-olive-11 hover:bg-olive-4 hover:text-olive-12"
        onClick={addUrl}
      >
        <LineChart className="h-4 w-4" />
      </button>
    </div>
  );
}

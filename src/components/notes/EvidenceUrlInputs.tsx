"use client";

import { LineChart, Trash2 } from "lucide-react";

interface EvidenceUrlInputsProps {
  urls: string[];
  onChange: (urls: string[]) => void;
}

function EvidenceUrlInputsInner({ urls, onChange }: EvidenceUrlInputsProps) {
  const removeUrl = (index: number) =>
    onChange(urls.filter((_, i) => i !== index));
  const updateUrl = (index: number, value: string) =>
    onChange(urls.map((u, i) => (i === index ? value : u)));

  if (urls.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      {urls.map((url, i) => (
        <div key={i} className="space-y-1">
          <div className="flex gap-2">
            <input
              type="url"
              aria-label={`Chart URL ${i + 1}`}
              className="flex-1 rounded-sm border-b border-olive-6 bg-transparent px-0 py-1 text-sm text-olive-12 placeholder:text-olive-10 focus:border-olive-8 focus:outline-none"
              placeholder="Chart image URL"
              value={url}
              onChange={(e) => updateUrl(i, e.target.value)}
            />
            <button
              type="button"
              aria-label={`Remove chart URL ${i + 1}`}
              title="Remove"
              className="rounded p-1 text-olive-10 hover:bg-olive-4 hover:text-red-9"
              onClick={() => removeUrl(i)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
          {url.trim() && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={url.trim()}
              alt={`Chart preview ${i + 1}`}
              className="max-h-40 rounded border border-olive-6"
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
    </div>
  );
}

function AddButton({ urls, onChange }: EvidenceUrlInputsProps) {
  return (
    <button
      type="button"
      aria-label="Add chart image"
      title="Add chart image"
      className="rounded p-1 text-olive-10 hover:bg-olive-4 hover:text-olive-12"
      onClick={() => onChange([...urls, ""])}
    >
      <LineChart className="h-3.5 w-3.5" />
    </button>
  );
}

export const EvidenceUrlInputs = Object.assign(EvidenceUrlInputsInner, {
  AddButton,
});

export function normalizeEditableChartUrls(urls: string[]): string[] {
  const nextUrls = [...urls];

  while (nextUrls.length > 0 && nextUrls.at(-1)?.trim() === "") {
    nextUrls.pop();
  }

  return [...nextUrls, ""];
}

export function getSubmittedChartUrls(urls: string[]): string[] {
  return urls.map((url) => url.trim()).filter(Boolean);
}

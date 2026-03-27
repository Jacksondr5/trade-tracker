import { describe, expect, it } from "vitest";
import {
  getSubmittedChartUrls,
  normalizeEditableChartUrls,
} from "./chart-urls";

describe("normalizeEditableChartUrls", () => {
  it("keeps a trailing empty input when the last slot is populated", () => {
    expect(normalizeEditableChartUrls(["https://example.com/chart.png"])).toEqual(
      ["https://example.com/chart.png", ""],
    );
  });

  it("collapses extra trailing empty inputs", () => {
    expect(
      normalizeEditableChartUrls(["https://example.com/chart.png", "", ""]),
    ).toEqual(["https://example.com/chart.png", ""]);
  });

  it("returns a single empty input when there are no values", () => {
    expect(normalizeEditableChartUrls([])).toEqual([""]);
    expect(normalizeEditableChartUrls([""])).toEqual([""]);
  });

  it("does not treat whitespace as a populated trailing value", () => {
    expect(normalizeEditableChartUrls(["https://example.com/chart.png", "   "])).toEqual([
      "https://example.com/chart.png",
      "",
    ]);
  });
});

describe("getSubmittedChartUrls", () => {
  it("trims and removes empty values before submit", () => {
    expect(
      getSubmittedChartUrls([
        " https://example.com/chart-a.png ",
        "",
        "   ",
        "https://example.com/chart-b.png",
      ]),
    ).toEqual([
      "https://example.com/chart-a.png",
      "https://example.com/chart-b.png",
    ]);
  });
});

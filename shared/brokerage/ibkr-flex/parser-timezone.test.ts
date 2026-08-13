import { afterEach, describe, expect, it, vi } from "vitest";

const originalFormatToParts = Intl.DateTimeFormat.prototype.formatToParts;

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("IBKR Flex parser timezone runtime guard", () => {
  it("memoizes a successful EDT and EST behavior check", async () => {
    vi.resetModules();
    const formatToParts = vi
      .spyOn(Intl.DateTimeFormat.prototype, "formatToParts")
      .mockImplementation(function (date) {
        return originalFormatToParts.call(this, date);
      });
    const { parseIbkrFlexActivityXml } = await import("./parser");

    parseIbkrFlexActivityXml("<invalid />");
    parseIbkrFlexActivityXml("<invalid />");

    expect(formatToParts).toHaveBeenCalledTimes(2);
  });

  it("fails loudly when America/New_York behavior resolves as UTC", async () => {
    vi.resetModules();
    const utcFormatter = new Intl.DateTimeFormat("en-US", {
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
      minute: "2-digit",
      month: "2-digit",
      second: "2-digit",
      timeZone: "UTC",
      year: "numeric",
    });
    vi.spyOn(Intl.DateTimeFormat.prototype, "formatToParts").mockImplementation(
      (date) => originalFormatToParts.call(utcFormatter, date),
    );
    const { parseIbkrFlexActivityXml } = await import("./parser");

    expect(() => parseIbkrFlexActivityXml("<invalid />")).toThrow(
      "timezone data unavailable in this runtime — America/New_York resolved to UTC",
    );
  });
});

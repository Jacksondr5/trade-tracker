import { describe, expect, it } from "vitest";
import {
  BRAVOS_DEACTIVATED_MESSAGE,
  bravosDeactivatedResponse,
  isBravosEnabled,
} from "./disabled";

describe("bravosDeactivatedResponse", () => {
  it("keeps Bravos disabled", () => {
    delete process.env.BRAVOS_ENABLED;
    expect(isBravosEnabled()).toBe(false);
  });

  it("clearly rejects requests to the disabled feature", async () => {
    const response = bravosDeactivatedResponse();

    await expect(response.json()).resolves.toEqual({
      error: BRAVOS_DEACTIVATED_MESSAGE,
    });
    expect(response.status).toBe(410);
  });
});

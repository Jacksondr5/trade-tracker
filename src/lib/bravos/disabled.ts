import { NextResponse } from "next/server";

export const BRAVOS_DEACTIVATED_MESSAGE = "Bravos import is deactivated";

export function isBravosEnabled() {
  return process.env.BRAVOS_ENABLED === "true";
}

export function bravosDeactivatedResponse() {
  return NextResponse.json(
    { error: BRAVOS_DEACTIVATED_MESSAGE },
    { status: 410 },
  );
}

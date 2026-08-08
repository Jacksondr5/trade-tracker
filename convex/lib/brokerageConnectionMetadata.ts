import { ConvexError, type Infer, v } from "convex/values";

export const optionalMetadataStringPatchValidator = v.union(
  v.object({ kind: v.literal("set"), value: v.string() }),
  v.object({ kind: v.literal("clear") }),
);

export type OptionalMetadataStringPatch = Infer<
  typeof optionalMetadataStringPatchValidator
>;

export function resolveOptionalMetadataStringPatch(args: {
  fieldName: string;
  maxLength: number;
  patch: OptionalMetadataStringPatch;
}): string | undefined {
  if (args.patch.kind === "clear") return undefined;
  const value = args.patch.value.trim();
  if (!value) {
    throw new ConvexError(
      `${args.fieldName} cannot be empty; use the explicit clear action to remove it`,
    );
  }
  if (value.length > args.maxLength) {
    throw new ConvexError(
      `${args.fieldName} must be ${args.maxLength} characters or less`,
    );
  }
  return value;
}

export function validateTokenExpiresAt(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new ConvexError("IBKR Flex token expiration date is required");
  }
  return value;
}

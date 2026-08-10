import { ConvexError, type Infer, v } from "convex/values";

export const optionalMetadataStringPatchValidator = v.union(
  v.object({ kind: v.literal("set"), value: v.string() }),
  v.object({ kind: v.literal("clear") }),
);

export const optionalMetadataStringArrayPatchValidator = v.union(
  v.object({ kind: v.literal("set"), value: v.array(v.string()) }),
  v.object({ kind: v.literal("clear") }),
);

export type OptionalMetadataStringPatch = Infer<
  typeof optionalMetadataStringPatchValidator
>;

export type OptionalMetadataStringArrayPatch = Infer<
  typeof optionalMetadataStringArrayPatchValidator
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

export function resolveOptionalMetadataStringArrayPatch(args: {
  fieldName: string;
  itemName: string;
  maxItemLength: number;
  maxItems: number;
  patch: OptionalMetadataStringArrayPatch;
}): string[] | undefined {
  if (args.patch.kind === "clear") return undefined;
  const values = Array.from(
    new Set(
      args.patch.value.map((value) => value.trim().toUpperCase()).filter(Boolean),
    ),
  );
  if (values.length === 0) {
    throw new ConvexError(
      `${args.fieldName} cannot be empty; use the explicit clear action to remove it`,
    );
  }
  if (values.length > args.maxItems) {
    throw new ConvexError(
      `${args.fieldName} must contain ${args.maxItems} items or fewer`,
    );
  }
  if (values.some((value) => value.length > args.maxItemLength)) {
    throw new ConvexError(
      `Each ${args.itemName} must be ${args.maxItemLength} characters or less`,
    );
  }
  return values;
}

export function validateTokenExpiresAt(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new ConvexError("IBKR Flex token expiration date is required");
  }
  return value;
}

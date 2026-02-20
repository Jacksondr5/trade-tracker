/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as analytics from "../analytics.js";
import type * as campaignNotes from "../campaignNotes.js";
import type * as campaigns from "../campaigns.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_plCalculation from "../lib/plCalculation.js";
import type * as portfolioSnapshots from "../portfolioSnapshots.js";
import type * as positions from "../positions.js";
import type * as tradePlans from "../tradePlans.js";
import type * as trades from "../trades.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  analytics: typeof analytics;
  campaignNotes: typeof campaignNotes;
  campaigns: typeof campaigns;
  "lib/auth": typeof lib_auth;
  "lib/plCalculation": typeof lib_plCalculation;
  portfolioSnapshots: typeof portfolioSnapshots;
  positions: typeof positions;
  tradePlans: typeof tradePlans;
  trades: typeof trades;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};

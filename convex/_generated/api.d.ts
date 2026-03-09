/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as accountMappings from "../accountMappings.js";
import type * as analytics from "../analytics.js";
import type * as campaigns from "../campaigns.js";
import type * as imports from "../imports.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_statuses from "../lib/statuses.js";
import type * as lib_tradeValidator from "../lib/tradeValidator.js";
import type * as navigation from "../navigation.js";
import type * as notes from "../notes.js";
import type * as portfolios from "../portfolios.js";
import type * as positions from "../positions.js";
import type * as strategyDoc from "../strategyDoc.js";
import type * as tradePlans from "../tradePlans.js";
import type * as trades from "../trades.js";
import type * as watchlist from "../watchlist.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  accountMappings: typeof accountMappings;
  analytics: typeof analytics;
  campaigns: typeof campaigns;
  imports: typeof imports;
  "lib/auth": typeof lib_auth;
  "lib/statuses": typeof lib_statuses;
  "lib/tradeValidator": typeof lib_tradeValidator;
  navigation: typeof navigation;
  notes: typeof notes;
  portfolios: typeof portfolios;
  positions: typeof positions;
  strategyDoc: typeof strategyDoc;
  tradePlans: typeof tradePlans;
  trades: typeof trades;
  watchlist: typeof watchlist;
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

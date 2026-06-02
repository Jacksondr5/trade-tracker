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
import type * as bravos from "../bravos.js";
import type * as brokerageIngestion from "../brokerageIngestion.js";
import type * as campaigns from "../campaigns.js";
import type * as crons from "../crons.js";
import type * as e2eSeed from "../e2eSeed.js";
import type * as http from "../http.js";
import type * as importTasks from "../importTasks.js";
import type * as imports from "../imports.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_brokerageFreshness from "../lib/brokerageFreshness.js";
import type * as lib_marketCalendar from "../lib/marketCalendar.js";
import type * as lib_marketDataInstruments from "../lib/marketDataInstruments.js";
import type * as lib_statuses from "../lib/statuses.js";
import type * as lib_tradeValidator from "../lib/tradeValidator.js";
import type * as marketData from "../marketData.js";
import type * as marketDataHealth from "../marketDataHealth.js";
import type * as navigation from "../navigation.js";
import type * as notes from "../notes.js";
import type * as portfolioAnalytics from "../portfolioAnalytics.js";
import type * as portfolioCashLedger from "../portfolioCashLedger.js";
import type * as portfolioPipeline from "../portfolioPipeline.js";
import type * as portfolios from "../portfolios.js";
import type * as positions from "../positions.js";
import type * as retrospectives from "../retrospectives.js";
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
  bravos: typeof bravos;
  brokerageIngestion: typeof brokerageIngestion;
  campaigns: typeof campaigns;
  crons: typeof crons;
  e2eSeed: typeof e2eSeed;
  http: typeof http;
  importTasks: typeof importTasks;
  imports: typeof imports;
  "lib/auth": typeof lib_auth;
  "lib/brokerageFreshness": typeof lib_brokerageFreshness;
  "lib/marketCalendar": typeof lib_marketCalendar;
  "lib/marketDataInstruments": typeof lib_marketDataInstruments;
  "lib/statuses": typeof lib_statuses;
  "lib/tradeValidator": typeof lib_tradeValidator;
  marketData: typeof marketData;
  marketDataHealth: typeof marketDataHealth;
  navigation: typeof navigation;
  notes: typeof notes;
  portfolioAnalytics: typeof portfolioAnalytics;
  portfolioCashLedger: typeof portfolioCashLedger;
  portfolioPipeline: typeof portfolioPipeline;
  portfolios: typeof portfolios;
  positions: typeof positions;
  retrospectives: typeof retrospectives;
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

export function normalizeSegment(value: string | number): string {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export const APP_PAGE_TITLES = {
  accounts: "accounts-page-title",
  campaigns: "campaigns-page-title",
  dashboard: "dashboard-page-title",
  imports: "imports-page-title",
  importsBravos: "bravos-review-page-title",
  marketData: "market-data-page-title",
  notes: "notes-page-title",
  portfolios: "portfolios-page-title",
  positions: "positions-page-title",
  strategy: "strategy-page-title",
  tradePlans: "trade-plans-page-title",
  trades: "trades-page-title",
} as const;

export const NAVIGATION_TEST_IDS = {
  accounts: "nav-accounts-link",
  campaigns: "nav-campaigns-link",
  dashboard: "nav-dashboard-link",
  importsBravos: "nav-imports-bravos-link",
  importsTrades: "nav-imports-trades-link",
  marketData: "nav-market-data-link",
  notes: "nav-notes-link",
  portfolios: "nav-portfolios-link",
  positions: "nav-positions-link",
  strategy: "nav-strategy-link",
  tradePlans: "nav-trade-plans-link",
  trades: "nav-trades-link",
} as const;

export const NAVIGATION_SECTION_TEST_IDS = {
  activity: "nav-section-activity",
  imports: "nav-section-imports",
  review: "nav-section-review",
  settings: "nav-section-settings",
  writing: "nav-section-writing",
} as const;

export const STRATEGY_TEST_IDS = {
  editor: "strategy-editor",
  editorInput: "strategy-editor-input",
  emptyState: "strategy-empty-state",
  emptyStateCta: "strategy-empty-state-cta",
  lastUpdated: "strategy-last-updated",
  saveStatus: "strategy-save-status",
} as const;

export const APP_SHELL_TEST_IDS = {
  editCampaignName: "edit-campaign-name",
  tradePlanNameInput: "trade-plan-name-input",
  tradePlanName: "trade-plan-name",
  tradePlanNameEditButton: "trade-plan-name-edit-button",
  tradePlanNameSaveButton: "trade-plan-name-save-button",
  tradePlanSymbol: "trade-plan-symbol",
  tradePlanSymbolEditButton: "trade-plan-symbol-edit-button",
  tradePlanSymbolInput: "trade-plan-symbol-input",
  tradePlanSymbolSaveButton: "trade-plan-symbol-save-button",
  toggleLocalGroupStandaloneTradePlans:
    "toggle-local-group-standalone-trade-plans",
  openCommandPaletteDesktop: "open-command-palette-desktop",
  openNavigationDrawer: "open-navigation-drawer",
  mobileNavigationDrawer: "mobile-navigation-drawer",
  commandPaletteInput: "command-palette-input",
} as const;

export const TRADE_PLAN_DETAIL_TEST_IDS = {
  backLink: "trade-plan-back-link",
  backLinkDesktop: "trade-plan-back-link-desktop",
  campaignContext: "trade-plan-campaign-context",
  campaignLink: "trade-plan-campaign-link",
  campaignSelect: "trade-plan-campaign-select",
  importFollowUpButton: "trade-plan-import-follow-up-button",
  relationshipLabel: "trade-plan-relationship-label",
  statusSelect: "trade-plan-status-select",
  tacticalSection: "trade-plan-tactical-section",
  tradesEmptyState: "trade-plan-detail-trades-empty-state",
  unlinkButton: "trade-plan-unlink-button",
} as const;

export const IMPORT_TASK_TRAY_TEST_IDS = {
  trigger: "import-task-tray-trigger",
  content: "import-task-tray-content",
  emptyState: "import-task-tray-empty",
} as const;

export function getImportTaskCardTestId(taskId: string): string {
  return `import-task-card-${normalizeSegment(taskId)}`;
}

export function getImportTaskDismissTestId(taskId: string): string {
  return `import-task-dismiss-${normalizeSegment(taskId)}`;
}

export function getImportTaskRetryTestId(taskId: string): string {
  return `import-task-retry-${normalizeSegment(taskId)}`;
}

export function getImportTaskGoToTestId(taskId: string): string {
  return `import-task-goto-${normalizeSegment(taskId)}`;
}

export const IMPORT_POST_DIALOG_TEST_IDS = {
  dialog: "import-post-dialog",
  doneButton: "import-post-done-button",
  errorAlert: "import-post-error-alert",
  pasteTextarea: "import-post-paste-textarea",
  processButton: "import-post-process-button",
  sourceUrlInput: "import-post-source-url-input",
  statusIndicator: "import-post-status-indicator",
} as const;

type CommandPaletteScope =
  | "campaign"
  | "trade-plan"
  | "watchlist-campaign"
  | "watchlist-trade-plan";

type LocalHierarchyItemScope =
  | "bravos-trade-plan"
  | "campaign"
  | "campaign-trade-plan"
  | "standalone-trade-plan"
  | "watchlist-campaign"
  | "watchlist-trade-plan";

export function getCampaignRowTestId(name: string): string {
  return `campaign-row-${normalizeSegment(name)}`;
}

export const TRADES_INDEX_TEST_IDS = {
  bulkClearSelection: "trades-bulk-clear-selection",
  bulkPortfolioSelect: "trades-bulk-portfolio-select",
  bulkToolbar: "trades-bulk-toolbar",
  bulkTradePlanSelect: "trades-bulk-trade-plan-select",
  emptyState: "trades-empty-state",
  filteredEmptyState: "trades-filtered-empty-state",
  filterPortfolio: "trades-filter-portfolio",
  filterAccount: "trades-filter-account",
  filterTicker: "trades-filter-ticker",
  filterStartDate: "trades-filter-start-date",
  filterEndDate: "trades-filter-end-date",
  paginationPrev: "trades-pagination-prev",
  paginationNext: "trades-pagination-next",
  pageSizeSelect: "trades-page-size-select",
  selectAll: "trades-select-all",
} as const;

export const IMPORTS_INDEX_TEST_IDS = {
  emptyState: "imports-empty-state",
  brokerageSelect: "brokerage-select",
} as const;

export const MARKET_DATA_TEST_IDS = {
  emptyState: "market-data-empty-state",
  errorAlert: "market-data-error-alert",
  noReviewState: "market-data-no-review-state",
  reviewSection: "market-data-review-section",
  resolvedSection: "market-data-resolved-section",
  tableNeedsReview: "market-data-instruments-table-needs-review",
  tableAllInstruments: "market-data-instruments-table-all-instruments",
} as const;

export const MARKET_DATA_TABS_TEST_IDS = {
  health: "market-data-tab-health",
  mappings: "market-data-tab-mappings",
} as const;

export const MARKET_DATA_HEALTH_TEST_IDS = {
  actionError: "market-data-health-action-error",
  actionStatus: "market-data-health-action-status",
  backfillEndDate: "market-data-health-backfill-end-date",
  backfillStartDate: "market-data-health-backfill-start-date",
  backfillSubmit: "market-data-health-backfill-submit",
  coverageEmpty: "market-data-health-coverage-empty",
  coverageSection: "market-data-health-coverage-section",
  failingJobsEmpty: "market-data-health-failing-jobs-empty",
  failingJobsSection: "market-data-health-failing-jobs-section",
  failingJobsTable: "market-data-health-failing-jobs-table",
  inFlightSection: "market-data-health-in-flight-section",
  inFlightFailedTotal: "market-data-health-in-flight-failed-total",
  inFlightLeased: "market-data-health-in-flight-leased",
  inFlightPending: "market-data-health-in-flight-pending",
  inFlightStuck: "market-data-health-in-flight-stuck",
  latestRunCompletedAt: "market-data-health-latest-run-completed-at",
  latestRunErrorMessage: "market-data-health-latest-run-error",
  latestRunSection: "market-data-health-latest-run-section",
  latestRunStartedAt: "market-data-health-latest-run-started-at",
  latestRunStatus: "market-data-health-latest-run-status",
  noRunsState: "market-data-health-no-runs-state",
  pageTitle: "market-data-health-page-title",
  recentRunsEmpty: "market-data-health-recent-runs-empty",
  recentRunsSection: "market-data-health-recent-runs-section",
  recentRunsTable: "market-data-health-recent-runs-table",
  runWorkerTickButton: "market-data-health-run-worker-tick-button",
  triggerDailyRefreshButton: "market-data-health-trigger-daily-refresh-button",
  triggersSection: "market-data-health-triggers-section",
} as const;

export function getMarketDataHealthRecentRunRowTestId(runId: string): string {
  return `market-data-health-recent-run-row-${normalizeSegment(runId)}`;
}

export function getMarketDataHealthFailingJobRowTestId(jobId: string): string {
  return `market-data-health-failing-job-row-${normalizeSegment(jobId)}`;
}

export function getMarketDataHealthRequeueButtonTestId(jobId: string): string {
  return `market-data-health-requeue-job-${normalizeSegment(jobId)}`;
}

export function getMarketDataHealthCoverageRowTestId(
  portfolioId: string,
): string {
  return `market-data-health-coverage-row-${normalizeSegment(portfolioId)}`;
}

export function getMarketDataHealthCoverageDayTestId(
  portfolioId: string,
  date: string,
): string {
  return `market-data-health-coverage-day-${normalizeSegment(portfolioId)}-${normalizeSegment(date)}`;
}

export function getMarketDataInstrumentRowTestId(
  assetType: string,
  symbol: string,
): string {
  return `market-data-row-${normalizeSegment(assetType)}-${normalizeSegment(symbol)}`;
}

export function getMarketDataEditProviderSymbolButtonTestId(
  assetType: string,
  symbol: string,
): string {
  return `market-data-edit-provider-symbol-${normalizeSegment(assetType)}-${normalizeSegment(symbol)}`;
}

export function getMarketDataProviderSymbolInputTestId(
  assetType: string,
  symbol: string,
): string {
  return `market-data-provider-symbol-input-${normalizeSegment(assetType)}-${normalizeSegment(symbol)}`;
}

export function getMarketDataSaveProviderSymbolButtonTestId(
  assetType: string,
  symbol: string,
): string {
  return `market-data-save-provider-symbol-${normalizeSegment(assetType)}-${normalizeSegment(symbol)}`;
}

export function getMarketDataCancelProviderSymbolButtonTestId(
  assetType: string,
  symbol: string,
): string {
  return `market-data-cancel-provider-symbol-${normalizeSegment(assetType)}-${normalizeSegment(symbol)}`;
}

export function getMarketDataIgnoreInstrumentButtonTestId(
  assetType: string,
  symbol: string,
): string {
  return `market-data-ignore-${normalizeSegment(assetType)}-${normalizeSegment(symbol)}`;
}

export function getMarketDataInstrumentStatusTestId(
  assetType: string,
  symbol: string,
): string {
  return `market-data-status-${normalizeSegment(assetType)}-${normalizeSegment(symbol)}`;
}

export const BRAVOS_REVIEW_TEST_IDS = {
  approveButton: "bravos-review-approve-button",
  connectButton: "bravos-connect-button",
  detailPanel: "bravos-review-detail",
  dismissButton: "bravos-review-dismiss-button",
  fetchPostButton: "bravos-fetch-post-button",
  fetchPostInput: "bravos-fetch-post-input",
  listingScanButton: "bravos-listing-scan-button",
  listingUrlInput: "bravos-listing-url-input",
  saveLoginSessionButton: "bravos-save-login-session-button",
  saveListingUrlButton: "bravos-save-listing-url-button",
  list: "bravos-review-list",
  paginationNext: "bravos-review-pagination-next",
  paginationPrev: "bravos-review-pagination-prev",
  syncCard: "bravos-sync-card",
  targetTradePlanSelect: "bravos-target-trade-plan-select",
} as const;

export function getBravosRunRetryTestId(runId: string): string {
  return `bravos-run-retry-${normalizeSegment(runId)}`;
}

export const TRADE_PLANS_INDEX_TEST_IDS = {
  createFormToggle: "trade-plans-create-form-toggle",
  createFormSection: "trade-plans-create-form-section",
  createSubmitButton: "trade-plans-create-submit-button",
  importFromServiceButton: "trade-plans-import-from-service-button",
  emptyState: "trade-plans-empty-state",
  emptyStateCta: "trade-plans-empty-state-cta",
  filterAll: "trade-plans-filter-all",
  filterBravos: "trade-plans-filter-bravos",
  filteredEmptyState: "trade-plans-filtered-empty-state",
  filterLinked: "trade-plans-filter-linked",
  filterStandalone: "trade-plans-filter-standalone",
  planList: "trade-plans-list",
  statusFilterSelect: "trade-plans-status-filter",
  summaryTotal: "trade-plans-summary-total",
  summaryActive: "trade-plans-summary-active",
  summaryPending: "trade-plans-summary-pending",
} as const;

export function getTradePlansStatusTestId(status: string): string {
  return `trade-plans-status-${normalizeSegment(status)}`;
}

export function getTradePlanRowTestId(id: string): string {
  return `trade-plan-row-${normalizeSegment(id)}`;
}

export function getStandaloneTradePlanCardTestId(id: string): string {
  return `standalone-trade-plan-card-${normalizeSegment(id)}`;
}

export function getTradePlanLinkTestId(id: string): string {
  return `trade-plan-link-${normalizeSegment(id)}`;
}

export function getCloseTradePlanButtonTestId(id: string): string {
  return `close-trade-plan-${normalizeSegment(id)}`;
}

export function getTradeRowTestId(
  ticker: string,
  uniqueKey: string | number,
): string {
  return `trade-row-${normalizeSegment(ticker)}-${normalizeSegment(uniqueKey)}`;
}

export function getInboxTradeRowTestId(
  ticker: string,
  uniqueKey: string | number,
): string {
  return `inbox-trade-row-${normalizeSegment(ticker)}-${normalizeSegment(uniqueKey)}`;
}

export function getInboxTradeAcceptButtonTestId(
  ticker: string,
  uniqueKey: string | number,
): string {
  return `inbox-trade-accept-${normalizeSegment(ticker)}-${normalizeSegment(uniqueKey)}`;
}

export function getInboxTradePortfolioSelectTestId(
  ticker: string,
  uniqueKey: string | number,
): string {
  return `inbox-trade-portfolio-${normalizeSegment(ticker)}-${normalizeSegment(uniqueKey)}`;
}

export function getCommandPaletteItemTestId(
  scope: CommandPaletteScope,
  key: string,
): string {
  return `command-palette-${scope}-${normalizeSegment(key)}`;
}

export function getLocalHierarchyCampaignChildrenToggleTestId(
  campaignName: string,
): string {
  return `toggle-campaign-children-${normalizeSegment(campaignName)}`;
}

export function getLocalHierarchyItemTestId(
  scope: LocalHierarchyItemScope,
  key: string,
): string {
  return `local-hierarchy-${scope}-${normalizeSegment(key)}`;
}

export function getLocalHierarchyWatchToggleTestId(
  scope: LocalHierarchyItemScope,
  key: string,
): string {
  return `local-hierarchy-watch-toggle-${scope}-${normalizeSegment(key)}`;
}

export function getNoteComposerFormTestId(prefix: string): string {
  return `${prefix}-add-note-form`;
}

export function getNoteComposerTextareaTestId(prefix: string): string {
  return `${prefix}-add-note-textarea`;
}

export function getNoteComposerDateInputTestId(prefix: string): string {
  return `${prefix}-add-note-date-input`;
}

export function getNoteComposerSubmitButtonTestId(prefix: string): string {
  return `${prefix}-add-note-button`;
}

export function getNoteRowTestId(prefix: string, noteId: string): string {
  return `${prefix}-note-row-${noteId}`;
}

export function getNoteDateTestId(prefix: string, noteId: string): string {
  return `${prefix}-note-date-${noteId}`;
}

export function getNoteContextLinkTestId(
  prefix: string,
  noteId: string,
): string {
  return `${prefix}-note-context-link-${noteId}`;
}

export function getNoteContextTextTestId(
  prefix: string,
  noteId: string,
): string {
  return `${prefix}-note-context-text-${noteId}`;
}

export function getDeleteNoteButtonTestId(
  prefix: string,
  noteId: string,
): string {
  return `${prefix}-delete-note-button-${noteId}`;
}

export function getDeleteNoteButtonTooltipTestId(
  prefix: string,
  noteId: string,
): string {
  return `${prefix}-delete-note-tooltip-${noteId}`;
}

export function getEditNoteButtonTestId(
  prefix: string,
  noteId: string,
): string {
  return `${prefix}-edit-note-button-${noteId}`;
}

export function getEditNoteTextareaTestId(
  prefix: string,
  noteId: string,
): string {
  return `${prefix}-edit-note-textarea-${noteId}`;
}

export function getEditNoteDateInputTestId(
  prefix: string,
  noteId: string,
): string {
  return `${prefix}-edit-note-date-input-${noteId}`;
}

export function getSaveNoteButtonTestId(
  prefix: string,
  noteId: string,
): string {
  return `${prefix}-save-note-button-${noteId}`;
}

export function getCancelNoteButtonTestId(
  prefix: string,
  noteId: string,
): string {
  return `${prefix}-cancel-note-button-${noteId}`;
}

export function getNoteContentTestId(prefix: string, noteId: string): string {
  return `${prefix}-note-content-${noteId}`;
}

export const PORTFOLIO_DATA_ISSUES_TEST_IDS = {
  awaitingSnapshotGroup: "portfolio-data-issues-awaiting-snapshot",
  needsMappingGroup: "portfolio-data-issues-needs-mapping",
  panel: "portfolio-data-issues-panel",
  uncoveredTradesGroup: "portfolio-data-issues-uncovered-trades",
} as const;

export const PORTFOLIO_CAMPAIGN_EXPOSURE_UNCOVERED_ROW_TEST_ID =
  "portfolio-campaign-exposure-uncovered-row";

export const PORTFOLIO_DETAIL_TEST_IDS = {
  allocationCash: "portfolio-allocation-cash",
  allocationMarketValue: "portfolio-allocation-market-value",
  allocationSection: "portfolio-allocation-section",
  asOfDate: "portfolio-as-of-date",
  backLink: "portfolio-back-link",
  campaignExposureEmpty: "portfolio-campaign-exposure-empty",
  campaignExposureSection: "portfolio-campaign-exposure-section",
  campaignExposureUncovered: "portfolio-campaign-exposure-uncovered",
  cancelDeleteButton: "portfolio-cancel-delete-button",
  cancelEditNameButton: "portfolio-cancel-edit-name-button",
  confirmDeleteButton: "portfolio-confirm-delete-button",
  deleteButton: "portfolio-delete-button",
  editNameButton: "portfolio-edit-name-button",
  emptyValuationState: "portfolio-empty-valuation-state",
  equityChartSection: "portfolio-equity-chart-section",
  equityChartEmpty: "portfolio-equity-chart-empty",
  equityChartSvg: "portfolio-equity-chart-svg",
  missingPricesAlert: "portfolio-missing-prices-alert",
  nameDisplay: "portfolio-name-display",
  nameInput: "portfolio-name-input",
  openPositionsEmpty: "portfolio-open-positions-empty",
  openPositionsSection: "portfolio-open-positions-section",
  recentTradesEmpty: "portfolio-recent-trades-empty",
  recentTradesSection: "portfolio-recent-trades-section",
  returnPercent: "portfolio-return-percent",
  returnSection: "portfolio-return-section",
  saveNameButton: "portfolio-save-name-button",
  summaryCash: "portfolio-summary-cash",
  summaryMarketValue: "portfolio-summary-market-value",
  summaryTotalEquity: "portfolio-summary-total-equity",
  summarySection: "portfolio-summary-section",
  timeframeSelect: "portfolio-timeframe-select",
} as const;

export function getPortfolioCampaignExposureRowTestId(
  campaignId: string,
): string {
  return `portfolio-campaign-exposure-row-${normalizeSegment(campaignId)}`;
}

export function getPortfolioCampaignExposureLinkTestId(
  campaignId: string,
): string {
  return `portfolio-campaign-exposure-link-${normalizeSegment(campaignId)}`;
}

export function getPortfolioOpenPositionRowTestId(
  assetType: string,
  ticker: string,
  direction: string,
): string {
  return `portfolio-open-position-row-${normalizeSegment(assetType)}-${normalizeSegment(ticker)}-${normalizeSegment(direction)}`;
}

export function getPortfolioRecentTradeRowTestId(tradeId: string): string {
  return `portfolio-recent-trade-row-${normalizeSegment(tradeId)}`;
}

export function getPortfolioLinkTestId(portfolioKey: string): string {
  return `portfolio-link-${normalizeSegment(portfolioKey)}`;
}

export function getPortfolioRowTestId(name: string): string {
  return `portfolio-row-${normalizeSegment(name)}`;
}

export const PORTFOLIO_CASH_LEDGER_TEST_IDS = {
  addAmountInput: "cash-ledger-amount-input",
  addDateInput: "cash-ledger-date-input",
  addEntryTypeSelect: "cash-ledger-entry-type-select",
  addNoteInput: "cash-ledger-note-input",
  addSubmitButton: "cash-ledger-add-submit-button",
  emptyState: "cash-ledger-empty-state",
  errorAlert: "cash-ledger-error-alert",
  list: "cash-ledger-list",
  section: "portfolio-cash-ledger-section",
} as const;

export function getCashLedgerRowTestId(entryId: string): string {
  return `cash-ledger-row-${normalizeSegment(entryId)}`;
}

export function getCashLedgerEditButtonTestId(entryId: string): string {
  return `cash-ledger-edit-button-${normalizeSegment(entryId)}`;
}

export function getCashLedgerSaveButtonTestId(entryId: string): string {
  return `cash-ledger-save-button-${normalizeSegment(entryId)}`;
}

export function getCashLedgerCancelButtonTestId(entryId: string): string {
  return `cash-ledger-cancel-button-${normalizeSegment(entryId)}`;
}

export function getCashLedgerDeleteButtonTestId(entryId: string): string {
  return `cash-ledger-delete-button-${normalizeSegment(entryId)}`;
}

export function getCashLedgerDeleteTooltipTestId(entryId: string): string {
  return `cash-ledger-delete-tooltip-${normalizeSegment(entryId)}`;
}

export function getRetrospectiveSectionTestId(prefix: string): string {
  return `${prefix}-retrospective-section`;
}

export function getRetrospectiveTextareaTestId(prefix: string): string {
  return `${prefix}-retrospective-textarea`;
}

export function getSaveRetrospectiveButtonTestId(prefix: string): string {
  return `${prefix}-save-retrospective-button`;
}

export function getCancelRetrospectiveButtonTestId(prefix: string): string {
  return `${prefix}-cancel-retrospective-button`;
}

export function getEditRetrospectiveButtonTestId(prefix: string): string {
  return `${prefix}-edit-retrospective-button`;
}

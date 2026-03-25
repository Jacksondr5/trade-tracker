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
  imports: "nav-imports-link",
  notes: "nav-notes-link",
  portfolios: "nav-portfolios-link",
  positions: "nav-positions-link",
  strategy: "nav-strategy-link",
  tradePlans: "nav-trade-plans-link",
  trades: "nav-trades-link",
} as const;

export const NAVIGATION_SECTION_TEST_IDS = {
  activity: "nav-section-activity",
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
  emptyState: "trades-empty-state",
  emptyStateCta: "trades-empty-state-cta",
  filteredEmptyState: "trades-filtered-empty-state",
  filterPortfolio: "trades-filter-portfolio",
  filterAccount: "trades-filter-account",
  filterTicker: "trades-filter-ticker",
  filterStartDate: "trades-filter-start-date",
  filterEndDate: "trades-filter-end-date",
  pageSizeSelect: "trades-page-size-select",
} as const;

export const IMPORTS_INDEX_TEST_IDS = {
  emptyState: "imports-empty-state",
  brokerageSelect: "brokerage-select",
} as const;

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

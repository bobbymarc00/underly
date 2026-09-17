export type CorporateActionStatus = "CLEAR" | "ACTIVE" | "UNKNOWN";

export interface CorporateActionEvent {
  type: "CORPORATE_ACTION_HALT" | "UNKNOWN_HALT";
  status: "ACTIVE";
  reasonCode: string | null;
  reasonMessage: string | null;
}

export interface CorporateActionSignal {
  activeIssue: boolean | null;
  status: CorporateActionStatus;
  events: CorporateActionEvent[];
  reason: string | null;
  source: "RWA_STATUS_INFO";
}

const CORPORATE_ACTION_PATTERNS = [
  "CORPORATE",
  "DIVIDEND",
  "SPLIT",
  "MERGER",
  "SPINOFF",
  "SPIN_OFF",
  "REORGANIZATION",
];

const ORDINARY_SESSION_STATUSES = new Set([
  "overnight",
  "premarket",
  "postmarket",
  "closed",
]);

function normalize(value?: string | null): string {
  return (value ?? "").trim();
}

function looksLikeCorporateAction(
  reasonCode?: string | null,
  reasonMessage?: string | null,
): boolean {
  const haystack = [normalize(reasonCode), normalize(reasonMessage)]
    .join(" ")
    .toUpperCase();

  return CORPORATE_ACTION_PATTERNS.some((pattern) => haystack.includes(pattern));
}

function isOrdinarySessionRestriction(params: {
  tradingAvailable: boolean | null;
  marketStatus?: string | null;
  reasonCode?: string | null;
}): boolean {
  if (params.tradingAvailable !== false) return false;

  const marketStatus = normalize(params.marketStatus).toLowerCase();
  const reasonCode = normalize(params.reasonCode).toUpperCase();
  const ordinaryReason =
    reasonCode === "" ||
    reasonCode === "MARKET_CLOSED" ||
    reasonCode === "UNSUPPORTED";

  return ordinaryReason && ORDINARY_SESSION_STATUSES.has(marketStatus);
}

export function buildCorporateActionSignal(params: {
  statusInfoAvailable: boolean;
  tradingAvailable: boolean | null;
  marketStatus?: string | null;
  reasonCode?: string | null;
  reasonMessage?: string | null;
}): CorporateActionSignal {
  if (!params.statusInfoAvailable) {
    return {
      activeIssue: null,
      status: "UNKNOWN",
      events: [],
      reason: "STATUS_INFO_UNAVAILABLE",
      source: "RWA_STATUS_INFO",
    };
  }

  if (looksLikeCorporateAction(params.reasonCode, params.reasonMessage)) {
    return {
      activeIssue: true,
      status: "ACTIVE",
      events: [
        {
          type: "CORPORATE_ACTION_HALT",
          status: "ACTIVE",
          reasonCode: params.reasonCode ?? null,
          reasonMessage: params.reasonMessage ?? null,
        },
      ],
      reason: params.reasonCode ?? "CORPORATE_ACTION",
      source: "RWA_STATUS_INFO",
    };
  }

  if (
    isOrdinarySessionRestriction({
      tradingAvailable: params.tradingAvailable,
      marketStatus: params.marketStatus,
      reasonCode: params.reasonCode,
    })
  ) {
    return {
      activeIssue: false,
      status: "CLEAR",
      events: [],
      reason: null,
      source: "RWA_STATUS_INFO",
    };
  }

  if (params.tradingAvailable === true) {
    return {
      activeIssue: false,
      status: "CLEAR",
      events: [],
      reason: null,
      source: "RWA_STATUS_INFO",
    };
  }

  if (params.tradingAvailable === false) {
    return {
      activeIssue: null,
      status: "UNKNOWN",
      events: [
        {
          type: "UNKNOWN_HALT",
          status: "ACTIVE",
          reasonCode: params.reasonCode ?? null,
          reasonMessage: params.reasonMessage ?? null,
        },
      ],
      reason: "UNCLASSIFIED_TRADING_RESTRICTION",
      source: "RWA_STATUS_INFO",
    };
  }

  return {
    activeIssue: null,
    status: "UNKNOWN",
    events: [],
    reason: "TRADING_STATE_UNKNOWN",
    source: "RWA_STATUS_INFO",
  };
}

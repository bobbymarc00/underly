import {
  describe,
  expect,
  it,
} from "vitest";

import {
  buildCorporateActionSignal,
} from "@/lib/underly/actions";

describe(
  "buildCorporateActionSignal",
  () => {
    it(
      "treats normal market closure as clear for corporate actions",
      () => {
        const result =
          buildCorporateActionSignal({
            statusInfoAvailable: true,

            tradingAvailable: false,

            marketStatus: "closed",

            reasonCode:
              "MARKET_CLOSED",

            reasonMessage:
              "Weekend or Holiday",
          });

        expect(result.status).toBe(
          "CLEAR",
        );

        expect(
          result.activeIssue,
        ).toBe(false);

        expect(
          result.events,
        ).toHaveLength(0);
      },
    );

    it(
      "treats unsupported overnight session as clear for corporate actions",
      () => {
        const result =
          buildCorporateActionSignal({
            statusInfoAvailable: true,

            tradingAvailable: false,

            marketStatus:
              "overnight",

            reasonCode:
              "UNSUPPORTED",

            reasonMessage:
              null,
          });

        expect(result.status).toBe(
          "CLEAR",
        );

        expect(
          result.activeIssue,
        ).toBe(false);

        expect(
          result.events,
        ).toHaveLength(0);
      },
    );

    it(
      "detects explicit corporate-action style halt",
      () => {
        const result =
          buildCorporateActionSignal({
            statusInfoAvailable: true,

            tradingAvailable: false,

            marketStatus:
              "postmarket",

            reasonCode:
              "CORPORATE_ACTION",

            reasonMessage:
              "Trading halted for stock split",
          });

        expect(result.status).toBe(
          "ACTIVE",
        );

        expect(
          result.activeIssue,
        ).toBe(true);

        expect(
          result.events,
        ).toHaveLength(1);

        expect(
          result.events[0]?.type,
        ).toBe(
          "CORPORATE_ACTION_HALT",
        );
      },
    );

    it(
      "detects corporate action from reason message even if reason code is generic",
      () => {
        const result =
          buildCorporateActionSignal({
            statusInfoAvailable: true,

            tradingAvailable: false,

            marketStatus:
              "postmarket",

            reasonCode:
              "UNSUPPORTED",

            reasonMessage:
              "Trading paused due to dividend corporate action",
          });

        expect(result.status).toBe(
          "ACTIVE",
        );

        expect(
          result.activeIssue,
        ).toBe(true);

        expect(
          result.events[0]?.type,
        ).toBe(
          "CORPORATE_ACTION_HALT",
        );
      },
    );

    it(
      "does not mislabel an unknown restriction as a corporate action",
      () => {
        const result =
          buildCorporateActionSignal({
            statusInfoAvailable: true,

            tradingAvailable: false,

            marketStatus:
              "restricted",

            reasonCode:
              "TEMPORARY_RESTRICTION",

            reasonMessage:
              "Temporarily unavailable",
          });

        expect(result.status).toBe(
          "UNKNOWN",
        );

        expect(
          result.activeIssue,
        ).toBe(null);

        expect(
          result.events[0]?.type,
        ).toBe("UNKNOWN_HALT");
      },
    );

    it(
      "returns clear when trading is available and there is no corporate action evidence",
      () => {
        const result =
          buildCorporateActionSignal({
            statusInfoAvailable: true,

            tradingAvailable: true,

            marketStatus:
              "postmarket",

            reasonCode: null,

            reasonMessage: null,
          });

        expect(result.status).toBe(
          "CLEAR",
        );

        expect(
          result.activeIssue,
        ).toBe(false);

        expect(
          result.events,
        ).toHaveLength(0);
      },
    );

    it(
      "returns unknown when status information is unavailable",
      () => {
        const result =
          buildCorporateActionSignal({
            statusInfoAvailable: false,

            tradingAvailable: null,

            marketStatus: null,

            reasonCode: null,

            reasonMessage: null,
          });

        expect(result.status).toBe(
          "UNKNOWN",
        );

        expect(
          result.activeIssue,
        ).toBe(null);

        expect(result.reason).toBe(
          "STATUS_INFO_UNAVAILABLE",
        );
      },
    );

    it(
      "returns unknown when trading state itself cannot be determined",
      () => {
        const result =
          buildCorporateActionSignal({
            statusInfoAvailable: true,

            tradingAvailable: null,

            marketStatus: null,

            reasonCode: null,

            reasonMessage: null,
          });

        expect(result.status).toBe(
          "UNKNOWN",
        );

        expect(
          result.activeIssue,
        ).toBe(null);

        expect(result.reason).toBe(
          "TRADING_STATE_UNKNOWN",
        );
      },
    );
  },
);
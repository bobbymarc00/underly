import { describe, expect, it } from "vitest";

import {
  classifyNewsProviderFailure,
} from "../src/lib/news/public-error";

describe("public news error safety", () => {
  it("classifies rate-limit text without returning the raw upstream message", () => {
    const raw =
      "Alpha Vantage news unavailable: Thank you for using Alpha Vantage! " +
      "free API rate limit is 25 requests per day. " +
      "apikey=SECRET-KEY https://www.alphavantage.co/premium/";

    const result = classifyNewsProviderFailure(new Error(raw));

    expect(result.reasonCode).toBe("PROVIDER_RATE_LIMIT");
    expect(result.publicMessage).toBe(
      "News provider rate limit reached. Try again later.",
    );
    expect(result.publicMessage).not.toContain("SECRET-KEY");
    expect(result.publicMessage).not.toContain("alphavantage.co");
    expect(result.publicMessage).not.toContain("premium");
  });

  it("classifies timeouts safely", () => {
    const result = classifyNewsProviderFailure(
      new Error("request timed out after 12000ms"),
    );

    expect(result.reasonCode).toBe("PROVIDER_TIMEOUT");
    expect(result.publicMessage).toBe(
      "News provider timed out. Try again later.",
    );
  });

  it("uses a generic message for unknown provider failures", () => {
    const result = classifyNewsProviderFailure(
      new Error("opaque upstream failure: token=hidden"),
    );

    expect(result.reasonCode).toBe("PROVIDER_UNAVAILABLE");
    expect(result.publicMessage).not.toContain("token=hidden");
  });
});

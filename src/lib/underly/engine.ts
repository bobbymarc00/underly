import "server-only";

import crypto from "node:crypto";
import Decimal from "decimal.js";

import { requiredEnv } from "@/lib/binance/auth";
import {
  getRwaPrice,
  getUnderlyingMarket,
  getUnderlyingProfile,
  listBscRwaTokens,
  searchRwa,
  type RwaAssetRef,
  type RwaSearchRow,
} from "@/lib/binance/rwa";
import type { FirewallCheckRequest } from "@/lib/schemas/firewall";

import { buildCorporateActionSignal } from "./actions";
import { analyzeExecution } from "./execution";
import { buildFindings } from "./findings";
import { buildIntegrity } from "./integrity";
import { buildPassport } from "./passport";
import { buildProof } from "./proof";
import { buildValuation } from "./valuation";

export class UnderlyNotFoundError extends Error {}
export class UnderlyUpstreamError extends Error {}

function chainId(): string {
  return process.env.UNDERLY_CHAIN_ID || "56";
}

function calcReferenceGap(tokenPrice?: string, referencePrice?: string): string | null {
  if (!tokenPrice || !referencePrice) return null;
  const token = new Decimal(tokenPrice);
  const reference = new Decimal(referencePrice);
  if (reference.isZero()) return null;
  return token.div(reference).minus(1).mul(100).toSignificantDigits(18).toFixed();
}

function executionDescription(request: FirewallCheckRequest): string {
  if (request.intent === "BUY") {
    return "Current entry quote followed by a full reverse quote. This is a present-time liquidity probe, not a forecast of future investment return.";
  }
  if (request.intent === "SELL") {
    return request.tokenAmount
      ? "Direct current sell quote for the exact token quantity supplied by the user."
      : "Direct current sell quote for a token quantity derived from the supplied USD position notional and current token price.";
  }
  if (request.intent === "COLLATERAL") {
    return request.tokenAmount
      ? "Current liquidation value for the exact collateral token quantity supplied by the user."
      : "Current liquidation value for a token quantity derived from the supplied USD position notional and current token price.";
  }
  return "No execution quote is required for HOLD intent in Underly v0.1.";
}

async function resolveAssets(
  request: FirewallCheckRequest,
): Promise<{ underlying: RwaSearchRow; assets: RwaAssetRef[] }> {
  const chain = chainId();

  if (request.ticker) {
    const ticker = request.ticker.toUpperCase();
    const search = await searchRwa(ticker);
    if (search.code !== 0) throw new UnderlyUpstreamError(search.msg);

    const row =
      search.data?.find((item) => item.ticker.toUpperCase() === ticker) ??
      search.data?.[0];
    if (!row) throw new UnderlyNotFoundError(`No RWA found for ${request.ticker}`);

    const searchAssets = row.assets.filter(
      (asset) =>
        String(asset.binanceChainId) === chain &&
        (!request.platform || asset.platformId === request.platform),
    );
    if (!searchAssets.length) throw new UnderlyNotFoundError("No matching BSC wrapper found");

    let tokenListByContract = new Map<string, RwaAssetRef>();
    if (searchAssets.some((asset) => asset.decimals === undefined || asset.decimals === null)) {
      const list = await listBscRwaTokens(chain);
      if (list.code === 0) {
        tokenListByContract = new Map(
          (list.data ?? []).map((asset) => [asset.tokenContractAddress.toLowerCase(), asset]),
        );
      }
    }

    const assets = searchAssets.map((asset) => {
      const enriched = tokenListByContract.get(asset.tokenContractAddress.toLowerCase());
      return enriched ? { ...asset, ...enriched } : asset;
    });

    return { underlying: row, assets };
  }

  const list = await listBscRwaTokens(chain);
  if (list.code !== 0) throw new UnderlyUpstreamError(list.msg);

  const contract = request.contractAddress!.toLowerCase();
  const hit = list.data?.find(
    (asset) => asset.tokenContractAddress.toLowerCase() === contract,
  );
  if (!hit) throw new UnderlyNotFoundError("Contract not found in BSC RWA universe");

  const ticker = hit.underlyingTicker ?? hit.tokenSymbol;
  return {
    underlying: {
      ticker,
      companyName: hit.underlyingFullName ?? hit.companyName ?? ticker,
      assets: [hit],
    },
    assets: [hit],
  };
}

export async function runFirewallCheck(request: FirewallCheckRequest) {
  const chain = chainId();
  const quoteWallet = requiredEnv("UNDERLY_QUOTE_WALLET");
  const { underlying, assets } = await resolveAssets(request);
  const checkedAt = new Date().toISOString();
  const wrappers = [];

  for (const asset of assets) {
    const [priceEnvelope, marketEnvelope, profileEnvelope] = await Promise.all([
      getRwaPrice(chain, asset.tokenContractAddress),
      getUnderlyingMarket(chain, asset.tokenContractAddress),
      getUnderlyingProfile(chain, asset.tokenContractAddress),
    ]);

    const price = priceEnvelope.code === 0 ? priceEnvelope.data?.[0] ?? {} : {};
    const market = marketEnvelope.code === 0 ? marketEnvelope.data ?? {} : {};
    const profile = profileEnvelope.code === 0 ? profileEnvelope.data ?? {} : {};

    const passport = buildPassport(asset.platformId, profile);
    const attestationAvailable =
      passport.attestation.daily === "AVAILABLE"
        ? true
        : passport.attestation.daily === "UNAVAILABLE"
          ? false
          : null;

    const integrity = buildIntegrity({
      tokenShareRatio: profile.tokenToShareRatio,
      referencePrice: price.referencePrice,
      attestationAvailable,
    });

    const execution = await analyzeExecution({
      intent: request.intent,
      chainId: chain,
      amountUsd: request.amountUsd,
      tokenAmount: request.tokenAmount,
      wrapperContract: asset.tokenContractAddress,
      quoteWallet,
      tokenPriceUsd: price.tokenPrice,
      tokenDecimals: asset.decimals,
    });

    const referenceGapPct = calcReferenceGap(price.tokenPrice, price.referencePrice);

    let displayedValueUsd: string | null = request.amountUsd ?? null;
    if (request.tokenAmount && price.tokenPrice) {
      displayedValueUsd = new Decimal(request.tokenAmount)
        .mul(price.tokenPrice)
        .toSignificantDigits(24)
        .toFixed();
    }

    const valuation = displayedValueUsd
      ? buildValuation({
          displayedValueUsd,
          tokenPriceUsd: price.tokenPrice,
          referencePriceUsd: price.referencePrice,
          executableValueUsd: execution.executableValueUsd,
        })
      : null;

    const statusInfo = market.statusInfo ?? null;
    const corporateActions = buildCorporateActionSignal({
      statusInfoAvailable: statusInfo !== null,
      tradingAvailable: statusInfo?.openState ?? null,
      marketStatus: statusInfo?.marketStatus ?? null,
      reasonCode: statusInfo?.reasonCode ?? null,
      reasonMessage: statusInfo?.reasonMsg ?? null,
    });

    const findings = buildFindings({
      intent: request.intent,
      referenceGapPct,
      referenceUpstreamCode: priceEnvelope.code,
      tradingAvailable: statusInfo?.openState ?? null,
      execution,
      tokenShareRatioKnown: integrity.tokenShareRatioKnown,
      attestationDaily: passport.attestation.daily,
      passportPartial: passport.dataCompleteness === "PARTIAL",
      corporateActionStatus: corporateActions.status,
    });

    const sources: Array<Record<string, string | number>> = [
      {
        provider: "Binance Web3 API",
        endpoint: "RWA Price",
        observedAt: checkedAt,
        upstreamCode: priceEnvelope.code,
        upstreamMessage: priceEnvelope.msg,
      },
      {
        provider: "Binance Web3 API",
        endpoint: "Underlying Market",
        observedAt: checkedAt,
        upstreamCode: marketEnvelope.code,
        upstreamMessage: marketEnvelope.msg,
      },
      {
        provider: "Binance Web3 API",
        endpoint: "Underlying Profile",
        observedAt: checkedAt,
        upstreamCode: profileEnvelope.code,
        upstreamMessage: profileEnvelope.msg,
      },
    ];

    if (execution.entry.attempted || execution.exit.attempted) {
      sources.push({
        provider: "Binance Web3 API",
        endpoint: "Aggregator Quote",
        observedAt: execution.quoteTimestamp,
      });
    }

    wrappers.push({
      identity: {
        symbol: asset.tokenSymbol,
        platform: asset.platformId,
        chainId: chain,
        contractAddress: asset.tokenContractAddress,
        tokenDecimals: asset.decimals ?? null,
        tokenShareRatio: profile.tokenToShareRatio ?? null,
      },
      passport,
      market: {
        tokenPriceUsd: price.tokenPrice ?? null,
        referencePriceUsd: price.referencePrice ?? null,
        referenceGapPct,
        tokenPriceUpdatedAt: price.tokenPriceUpdatedAt ?? null,
        referencePriceUpdatedAt: price.referencePriceUpdatedAt ?? null,
        session: {
          tradingAvailable: statusInfo?.openState ?? null,
          status: statusInfo?.marketStatus ?? null,
          reasonCode: statusInfo?.reasonCode ?? null,
          reasonMessage: statusInfo?.reasonMsg ?? null,
          nextOpenAt: statusInfo?.nextOpenTime ?? null,
          nextCloseAt: statusInfo?.nextCloseTime ?? null,
        },
      },
      integrity,
      execution,
      valuation,
      corporateActions,
      findings,
      sources,
    });
  }

  const amountMeaning = request.tokenAmount
    ? "TOKEN_QUANTITY"
    : request.intent === "BUY"
      ? "TRADE_NOTIONAL"
      : request.intent === "HOLD"
        ? request.amountUsd
          ? "POSITION_NOTIONAL"
          : "NONE"
        : request.intent === "SELL"
          ? "POSITION_NOTIONAL_TO_EXIT"
          : "COLLATERAL_POSITION_NOTIONAL";

  const positionInput = request.tokenAmount
    ? "TOKEN_AMOUNT"
    : request.amountUsd
      ? "USD_NOTIONAL"
      : "NONE";

  const withoutProof = {
    version: "0.1",
    requestId: `chk_${crypto.randomUUID()}`,
    checkedAt,
    request: {
      ticker: request.ticker?.toUpperCase() ?? null,
      contractAddress: request.contractAddress ?? null,
      intent: request.intent,
      amountUsd: request.amountUsd ?? null,
      tokenAmount: request.tokenAmount ?? null,
      amountMeaning,
      positionInput,
      platform: request.platform ?? null,
      chainId: chain,
    },
    methodology: {
      execution: executionDescription(request),
      conservativeValuation:
        "Minimum of displayed position/notional, reference-adjusted value, and current executable/liquidation value when applicable.",
      corporateActions:
        "ActionGuard classifies current RWA status signals as CLEAR, ACTIVE, or UNKNOWN. Underly does not infer corporate actions without explicit source evidence.",
    },
    underlying: {
      ticker: underlying.ticker,
      name: underlying.companyName,
      assetType: "equity",
    },
    wrappers,
  };

  return { ...withoutProof, proof: buildProof(withoutProof) };
}

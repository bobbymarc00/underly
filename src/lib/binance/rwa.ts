import "server-only";
import {
  binanceSignedGet,
  type BinanceEnvelope,
  type BinanceRequestOptions,
} from "./client";

export interface RwaAssetRef {
  platformId: string;
  binanceChainId: string | number;
  tokenContractAddress: string;
  tokenSymbol: string;
  assetType?: number;
  decimals?: number | string;
}

export interface RwaSearchRow {
  ticker: string;
  companyName: string;
  assets: RwaAssetRef[];
}

export interface RwaPriceRow {
  tokenContractAddress?: string;
  tokenPrice?: string;
  referencePrice?: string;
  tokenPriceUpdatedAt?: number | string;
  referencePriceUpdatedAt?: number | string;
}

export interface RwaStatusInfo {
  openState?: boolean;
  marketStatus?: string | null;
  reasonCode?: string | null;
  reasonMsg?: string | null;
  nextOpenTime?: number | null;
  nextCloseTime?: number | null;
}

export interface RwaUnderlyingMarketFields {
  referencePrice?: string | number | null;
  high52W?: string | number | null;
  low52W?: string | number | null;
  volumeShares24H?: string | number | null;
  avgDailyVolume1Y?: string | number | null;
  totalShares?: string | number | null;
  marketCap?: string | number | null;
  turnoverRate?: string | number | null;
  amplitude?: string | number | null;
  peRatioTTM?: string | number | null;
  pbRatio?: string | number | null;
  dividendYield?: string | number | null;
  latestDividend?: string | number | null;
  [key: string]: string | number | null | undefined;
}

export interface RwaMarketData {
  binanceChainId?: string;
  tokenContractAddress?: string;
  platformId?: string;
  assetType?: number;
  statusInfo?: RwaStatusInfo;
  marketData?: RwaUnderlyingMarketFields;
}

export interface RwaCompanyInfo {
  ceo?: string | null;
  website?: string | null;
  industry?: string | null;
  conceptsEn?: string[] | null;
  conceptsCn?: string[] | null;
  descriptionEn?: string | null;
  descriptionZh?: string | null;
}

export interface RwaProfile {
  binanceChainId?: string;
  tokenContractAddress?: string;
  platformId?: string;
  underlyingTicker?: string;
  underlyingFullName?: string;
  assetType?: number;
  tokenToShareRatio?: string;
  protections?: {
    dailyAttestationReport?: { supported?: boolean; url?: string } | null;
    monthlyAttestationReport?: { supported?: boolean; url?: string } | null;
  };
  companyInfo?: RwaCompanyInfo | null;
}

export interface RwaTokenListRow extends RwaAssetRef {
  tokenName?: string;
  tokenLogoUrl?: string;
  underlyingTicker?: string;
  underlyingFullName?: string;
  underlyingName?: string;
  companyName?: string;
  tokenPrice?: string;
  referencePrice?: string;
  tokenToShareRatio?: string;
  volume24H?: string;
  marketCap?: string;
  peRatioTTM?: string;
  statusInfo?: RwaStatusInfo;
}

export function searchRwa(keyword: string): Promise<BinanceEnvelope<RwaSearchRow[]>> {
  return binanceSignedGet<RwaSearchRow[]>("/api/v1/dex/market/rwa/search", { keyword });
}

export function listBscRwaTokens(
  chainId: string,
  options?: BinanceRequestOptions,
): Promise<BinanceEnvelope<RwaTokenListRow[]>> {
  return binanceSignedGet<RwaTokenListRow[]>("/api/v1/dex/market/rwa/tokens", {
    binanceChainId: chainId,
  }, options);
}

export function getRwaPrices(
  chainId: string,
  contracts: string[],
  options?: BinanceRequestOptions,
): Promise<BinanceEnvelope<RwaPriceRow[]>> {
  return binanceSignedGet<RwaPriceRow[]>("/api/v1/dex/market/rwa/price", {
    binanceChainId: chainId,
    tokenContractAddresses: contracts.join(","),
  }, options);
}

export function getRwaPrice(
  chainId: string,
  contract: string,
  options?: BinanceRequestOptions,
): Promise<BinanceEnvelope<RwaPriceRow[]>> {
  return getRwaPrices(chainId, [contract], options);
}

export function getUnderlyingMarket(
  chainId: string,
  contract: string,
  options?: BinanceRequestOptions,
): Promise<BinanceEnvelope<RwaMarketData>> {
  return binanceSignedGet<RwaMarketData>("/api/v1/dex/market/rwa/underlying-market", {
    binanceChainId: chainId,
    tokenContractAddress: contract,
  }, options);
}

export function getUnderlyingProfile(
  chainId: string,
  contract: string,
  options?: BinanceRequestOptions,
): Promise<BinanceEnvelope<RwaProfile>> {
  return binanceSignedGet<RwaProfile>("/api/v1/dex/market/rwa/underlying-profile", {
    binanceChainId: chainId,
    tokenContractAddress: contract,
  }, options);
}

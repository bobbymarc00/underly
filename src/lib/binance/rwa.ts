import "server-only";
import { binanceSignedGet, type BinanceEnvelope } from "./client";

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

export interface RwaMarketData {
  binanceChainId?: string;
  tokenContractAddress?: string;
  platformId?: string;
  assetType?: number;
  statusInfo?: {
    openState?: boolean;
    marketStatus?: string | null;
    reasonCode?: string | null;
    reasonMsg?: string | null;
    nextOpenTime?: number | null;
    nextCloseTime?: number | null;
  };
  marketData?: Record<string, string | number | null>;
}

export interface RwaProfile {
  underlyingTicker?: string;
  underlyingFullName?: string;
  tokenToShareRatio?: string;
  protections?: {
    dailyAttestationReport?: { supported?: boolean; url?: string } | null;
    monthlyAttestationReport?: { supported?: boolean; url?: string } | null;
  };
}

export interface RwaTokenListRow extends RwaAssetRef {
  underlyingTicker?: string;
  underlyingFullName?: string;
  companyName?: string;
  tokenPrice?: string;
  referencePrice?: string;
  tokenToShareRatio?: string;
}

export function searchRwa(keyword: string): Promise<BinanceEnvelope<RwaSearchRow[]>> {
  return binanceSignedGet<RwaSearchRow[]>("/api/v1/dex/market/rwa/search", { keyword });
}

export function listBscRwaTokens(chainId: string): Promise<BinanceEnvelope<RwaTokenListRow[]>> {
  return binanceSignedGet<RwaTokenListRow[]>("/api/v1/dex/market/rwa/tokens", {
    binanceChainId: chainId,
  });
}

export function getRwaPrice(chainId: string, contract: string): Promise<BinanceEnvelope<RwaPriceRow[]>> {
  return binanceSignedGet<RwaPriceRow[]>("/api/v1/dex/market/rwa/price", {
    binanceChainId: chainId,
    tokenContractAddresses: contract,
  });
}

export function getUnderlyingMarket(chainId: string, contract: string): Promise<BinanceEnvelope<RwaMarketData>> {
  return binanceSignedGet<RwaMarketData>("/api/v1/dex/market/rwa/underlying-market", {
    binanceChainId: chainId,
    tokenContractAddress: contract,
  });
}

export function getUnderlyingProfile(chainId: string, contract: string): Promise<BinanceEnvelope<RwaProfile>> {
  return binanceSignedGet<RwaProfile>("/api/v1/dex/market/rwa/underlying-profile", {
    binanceChainId: chainId,
    tokenContractAddress: contract,
  });
}

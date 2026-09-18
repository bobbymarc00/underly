export interface WrapperMoveSample {
  provider: string;
  changePct: number;
}

export type MoverEvidenceStatus =
  | "CONSENSUS"
  | "SINGLE_SOURCE"
  | "REJECTED"
  | "UNAVAILABLE";

export interface MoverConsensus {
  status: MoverEvidenceStatus;
  changePct: number | null;
  wrapperSamples: number;
  spreadPctPoints: number | null;
}

function median(values: number[]): number {
  const ordered = [...values].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);

  if (ordered.length % 2 === 1) {
    return ordered[middle];
  }

  return (ordered[middle - 1] + ordered[middle]) / 2;
}

export function resolveMoverConsensus(
  wrapperCount: number,
  samples: WrapperMoveSample[],
  maxSpreadPctPoints = 5,
): MoverConsensus {
  const valid = samples.filter(
    (sample) => Number.isFinite(sample.changePct),
  );

  if (valid.length === 0) {
    return {
      status: "UNAVAILABLE",
      changePct: null,
      wrapperSamples: 0,
      spreadPctPoints: null,
    };
  }

  if (wrapperCount <= 1) {
    return {
      status: "SINGLE_SOURCE",
      changePct: valid[0].changePct,
      wrapperSamples: 1,
      spreadPctPoints: 0,
    };
  }

  if (valid.length < 2) {
    return {
      status: "REJECTED",
      changePct: null,
      wrapperSamples: valid.length,
      spreadPctPoints: null,
    };
  }

  const changes = valid.map((sample) => sample.changePct);
  const signs = new Set(
    changes.map((value) => (value > 0 ? 1 : value < 0 ? -1 : 0)),
  );

  const min = Math.min(...changes);
  const max = Math.max(...changes);
  const spread = max - min;

  if (signs.size !== 1 || spread > maxSpreadPctPoints) {
    return {
      status: "REJECTED",
      changePct: null,
      wrapperSamples: valid.length,
      spreadPctPoints: spread,
    };
  }

  return {
    status: "CONSENSUS",
    changePct: median(changes),
    wrapperSamples: valid.length,
    spreadPctPoints: spread,
  };
}

export function referencePriceDeviationPct(
  observedPrice: number,
  referencePrice: number,
): number {
  if (
    !Number.isFinite(observedPrice) ||
    !Number.isFinite(referencePrice) ||
    referencePrice <= 0
  ) {
    return Number.POSITIVE_INFINITY;
  }

  return (
    Math.abs(observedPrice - referencePrice) /
    referencePrice
  ) * 100;
}

export function isReferencePriceConsistent(
  observedPrice: number,
  referencePrice: number,
  maxDeviationPct: number,
): boolean {
  return (
    referencePriceDeviationPct(
      observedPrice,
      referencePrice,
    ) <= maxDeviationPct
  );
}


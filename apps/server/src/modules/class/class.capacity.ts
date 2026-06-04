export type CapacityMode = 'FreeStart' | 'StartSlot';

export interface ComputeClassCapacityInput {
  effectiveStartMode: string;
  maxNumberOfCompetitors: number | null;
  competitorCount: number;
  vacancyCount: number;
}

export interface ComputedClassCapacity {
  availableCount: number;
  capacityMode: CapacityMode;
  isFull: boolean;
}

export function computeClassCapacity(input: ComputeClassCapacityInput): ComputedClassCapacity {
  const { effectiveStartMode, maxNumberOfCompetitors, competitorCount, vacancyCount } = input;

  // maxNumberOfCompetitors is always the hard cap — null means unconfigured → no capacity.
  if (maxNumberOfCompetitors === null) {
    const capacityMode = effectiveStartMode === 'FreeStart' ? 'FreeStart' : 'StartSlot';
    return { availableCount: 0, capacityMode, isFull: true };
  }

  const headroom = Math.max(0, maxNumberOfCompetitors - competitorCount);

  if (effectiveStartMode === 'FreeStart') {
    return { availableCount: headroom, capacityMode: 'FreeStart', isFull: headroom === 0 };
  }

  const availableCount = Math.min(vacancyCount, headroom);
  return { availableCount, capacityMode: 'StartSlot', isFull: availableCount === 0 };
}

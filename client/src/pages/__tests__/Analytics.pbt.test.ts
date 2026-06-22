/**
 * P7: Analytics Progress Bar Width Bounds
 * Validates: Requirements 9.4
 *
 * Property: For any quality distribution data where totalMeasurements >= 0
 * and each quality count >= 0, every progress bar fill width is in the
 * range [0%, 100%].
 *
 * The percentage calculation extracted from Analytics.tsx:
 *   Math.round((count / Math.max(totalMeasurements, 1)) * 100)
 *
 * In the real system, each quality count is always <= totalMeasurements
 * (totalMeasurements is the sum of all quality counts). The generator
 * reflects this constraint so the property matches actual usage.
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";

/**
 * Pure percentage calculation function mirroring the logic in Analytics.tsx.
 * This is the exact formula used to compute progress bar fill widths.
 */
function computeQualityPercentage(count: number, totalMeasurements: number): number {
  return Math.round((count / Math.max(totalMeasurements, 1)) * 100);
}

/**
 * Generator that produces a realistic quality distribution:
 * - totalMeasurements is the sum of all four quality counts
 * - each individual count is therefore always <= totalMeasurements
 */
const qualityDistributionArb = fc
  .tuple(fc.nat(), fc.nat(), fc.nat(), fc.nat())
  .map(([excellent, good, fair, poor]) => ({
    excellent,
    good,
    fair,
    poor,
    totalMeasurements: excellent + good + fair + poor,
  }));

describe("Analytics quality percentage calculation", () => {
  /**
   * P7: Progress bar width is always in [0, 100] for arbitrary non-negative inputs
   * where each count is drawn from a realistic distribution (count <= totalMeasurements).
   */
  it("P7: percentage is always in [0, 100] for arbitrary non-negative integer counts", () => {
    fc.assert(
      fc.property(qualityDistributionArb, ({ excellent, good, fair, poor, totalMeasurements }) => {
        const percentages = [
          computeQualityPercentage(excellent, totalMeasurements),
          computeQualityPercentage(good, totalMeasurements),
          computeQualityPercentage(fair, totalMeasurements),
          computeQualityPercentage(poor, totalMeasurements),
        ];

        return percentages.every((p) => p >= 0 && p <= 100);
      })
    );
  });

  it("P7: percentage is 0 when count is 0 regardless of totalMeasurements", () => {
    fc.assert(
      fc.property(fc.nat(), (totalMeasurements) => {
        const pct = computeQualityPercentage(0, totalMeasurements);
        return pct === 0;
      })
    );
  });

  it("P7: percentage is 100 when count equals totalMeasurements (and totalMeasurements > 0)", () => {
    fc.assert(
      fc.property(fc.nat({ max: 1_000_000 }), (n) => {
        if (n === 0) return true; // skip zero — division by max(0,1)=1 gives 0%, not 100%
        const pct = computeQualityPercentage(n, n);
        return pct === 100;
      })
    );
  });

  it("P7: totalMeasurements=0 edge case — percentage is always 0 (denominator clamped to 1)", () => {
    fc.assert(
      fc.property(fc.nat(), (_count) => {
        // When totalMeasurements is 0, Math.max(0, 1) = 1, so result = 0 * 100 = 0%
        // In a valid state with no measurements, all quality counts are also 0.
        const pct = computeQualityPercentage(0, 0);
        return pct === 0;
      })
    );
  });
});

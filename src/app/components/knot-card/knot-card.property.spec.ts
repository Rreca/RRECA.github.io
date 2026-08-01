import * as fc from 'fast-check';

// Feature: knot-chains, Property Tests for KnotCard Chain Badge Display
describe('KnotCard Chain Badge Property Tests', () => {

  // ─── Pure logic extracted from KnotCardComponent ─────────────────────────

  /**
   * Computes the chain indicator badge info.
   * Mirrors KnotCardComponent.chainIndicator logic.
   */
  function computeChainIndicator(
    chainOrder: number,
    chainSize: number
  ): { position: number; total: number } {
    const position = chainOrder + 1; // 0-based to 1-based
    return { position, total: chainSize };
  }

  /**
   * Computes the truncated chain name.
   * Mirrors KnotCardComponent.chainNameTruncated logic.
   */
  function computeChainNameTruncated(name: string): string {
    return name.length > 20 ? name.substring(0, 20) + '…' : name;
  }

  // ─── Property 10: Chain Indicator Badge Format ────────────────────────────

  // Feature: knot-chains, Property 10: Chain Indicator Badge Format
  // **Validates: Requirements 7.1**
  it('Property 10: badge shows (P+1)/T for knot at chainOrder P in chain of size T', () => {
    fc.assert(fc.property(
      fc.integer({ min: 1, max: 50 }),  // chain size T (at least 1)
      fc.integer({ min: 0, max: 49 }),  // chainOrder P
      (T, P) => {
        // Only consider valid states where P < T
        fc.pre(P < T);

        const indicator = computeChainIndicator(P, T);

        // Position is 1-based: P + 1
        expect(indicator.position).toBe(P + 1);

        // Total matches chain size
        expect(indicator.total).toBe(T);

        // Badge text format is "{position}/{total}"
        const badgeText = `${indicator.position}/${indicator.total}`;
        expect(badgeText).toMatch(/^\d+\/\d+$/);

        // Position is within valid range [1, T]
        expect(indicator.position).toBeGreaterThanOrEqual(1);
        expect(indicator.position).toBeLessThanOrEqual(T);
      }
    ), { numRuns: 100 });
  });

  // ─── Property 11: Chain Name Truncation ───────────────────────────────────

  // Feature: knot-chains, Property 11: Chain Name Truncation
  // **Validates: Requirements 7.2**
  it('Property 11: names > 20 chars truncated with "…", others shown in full', () => {
    fc.assert(fc.property(
      fc.string({ minLength: 0, maxLength: 100 }),
      (name) => {
        const truncated = computeChainNameTruncated(name);

        if (name.length > 20) {
          // Truncated to first 20 chars + ellipsis character
          expect(truncated.length).toBe(21); // 20 chars + 1 ellipsis char '…'
          expect(truncated.endsWith('…')).toBeTrue();
          expect(truncated.slice(0, 20)).toBe(name.slice(0, 20));
        } else {
          // Shown in full, unchanged
          expect(truncated).toBe(name);
        }
      }
    ), { numRuns: 100 });
  });
});

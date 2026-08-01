import * as fc from 'fast-check';
import { KnotStatus } from '../../models/knot.model';
import { Chain } from '../../models/chain.model';

// Feature: knot-chains, Property Tests for ChainView Active Node and Display Order
describe('ChainView Property Tests', () => {

  // ─── Pure logic extracted from ChainViewComponent ─────────────────────────

  const ALL_STATUSES: KnotStatus[] = ['BLOCKED', 'UNLOCKABLE', 'DOING', 'DONE', 'SOMEDAY', 'ARCHIVED'];
  const NON_DONE_STATUSES: KnotStatus[] = ['BLOCKED', 'UNLOCKABLE', 'DOING', 'SOMEDAY', 'ARCHIVED'];

  interface ChainKnot {
    id: string;
    status: KnotStatus;
    chainOrder: number;
  }

  /**
   * Determines the node state for a given knot within a chain.
   * Mirrors ChainViewComponent.getNodeState logic:
   * - If knot is DONE → 'done'
   * - If knot is the first non-DONE by chainOrder → 'active'
   * - Otherwise → 'pending'
   */
  function getNodeState(
    knot: ChainKnot,
    allKnots: ChainKnot[]
  ): 'active' | 'done' | 'pending' {
    if (knot.status === 'DONE') {
      return 'done';
    }
    const sorted = [...allKnots].sort((a, b) => a.chainOrder - b.chainOrder);
    const firstNonDone = sorted.find(k => k.status !== 'DONE');
    if (firstNonDone && firstNonDone.id === knot.id) {
      return 'active';
    }
    return 'pending';
  }

  /**
   * Finds the active node in a chain (first non-DONE by chainOrder).
   * Returns undefined if all knots are DONE.
   */
  function findActiveNode(knots: ChainKnot[]): ChainKnot | undefined {
    const sorted = [...knots].sort((a, b) => a.chainOrder - b.chainOrder);
    return sorted.find(k => k.status !== 'DONE');
  }

  /**
   * Sorts chains by createdAt descending (newest first).
   * Mirrors ChainViewComponent display order.
   */
  function sortChainsForDisplay(chains: Chain[]): Chain[] {
    return [...chains].sort((a, b) => b.createdAt - a.createdAt);
  }

  // ─── Generators ───────────────────────────────────────────────────────────

  /** Generate a chain knot with a specific chainOrder */
  function arbChainKnot(chainOrder: number): fc.Arbitrary<ChainKnot> {
    return fc.record({
      id: fc.uuid(),
      status: fc.constantFrom(...ALL_STATUSES),
      chainOrder: fc.constant(chainOrder),
    });
  }

  /** Generate a list of N knots with consecutive chainOrder 0..N-1 */
  function arbChainKnots(minSize: number, maxSize: number): fc.Arbitrary<ChainKnot[]> {
    return fc.integer({ min: minSize, max: maxSize }).chain(size =>
      fc.tuple(
        ...Array.from({ length: size }, (_, i) => arbChainKnot(i))
      ).map(knots => knots as ChainKnot[])
    );
  }

  /** Generate a chain knot with at least one non-DONE status guaranteed */
  function arbChainKnotNonDone(chainOrder: number): fc.Arbitrary<ChainKnot> {
    return fc.record({
      id: fc.uuid(),
      status: fc.constantFrom(...NON_DONE_STATUSES),
      chainOrder: fc.constant(chainOrder),
    });
  }

  /** Generate a Chain record with random createdAt */
  function arbChain(): fc.Arbitrary<Chain> {
    return fc.record({
      id: fc.uuid(),
      name: fc.string({ minLength: 1, maxLength: 50 }),
      createdAt: fc.integer({ min: 1_000_000_000_000, max: 2_000_000_000_000 }),
    });
  }

  // ─── Property 8: Active Node Identification ───────────────────────────────

  // Feature: knot-chains, Property 8: Active Node Identification
  // **Validates: Requirements 6.2, 10.5, 10.6**
  describe('Property 8: Active Node Identification', () => {

    it('active node is the knot with lowest chainOrder among non-DONE knots', () => {
      fc.assert(fc.property(
        // Generate chain with 1-20 knots, at least 1 non-DONE
        fc.integer({ min: 1, max: 20 }).chain(size => {
          // Pick a random position to be non-DONE (guarantees at least one)
          return fc.integer({ min: 0, max: size - 1 }).chain(forcedNonDoneIdx =>
            fc.tuple(
              ...Array.from({ length: size }, (_, i) =>
                i === forcedNonDoneIdx
                  ? arbChainKnotNonDone(i)
                  : arbChainKnot(i)
              )
            ).map(knots => knots as ChainKnot[])
          );
        }),
        (knots) => {
          const nonDoneKnots = knots.filter(k => k.status !== 'DONE');
          // Precondition: at least one non-DONE knot exists
          fc.pre(nonDoneKnots.length > 0);

          // Find expected active: lowest chainOrder among non-DONE
          const expectedActive = nonDoneKnots.reduce((min, k) =>
            k.chainOrder < min.chainOrder ? k : min
          );

          // Verify the active node identification
          const activeNode = findActiveNode(knots);
          expect(activeNode).toBeDefined();
          expect(activeNode!.id).toBe(expectedActive.id);
          expect(activeNode!.chainOrder).toBe(expectedActive.chainOrder);

          // Verify getNodeState returns 'active' for this knot
          expect(getNodeState(expectedActive, knots)).toBe('active');

          // Verify all other non-DONE knots are 'pending'
          for (const k of nonDoneKnots) {
            if (k.id !== expectedActive.id) {
              expect(getNodeState(k, knots)).toBe('pending');
            }
          }

          // Verify all DONE knots return 'done'
          for (const k of knots.filter(x => x.status === 'DONE')) {
            expect(getNodeState(k, knots)).toBe('done');
          }
        }
      ), { numRuns: 100 });
    });

    it('when all knots are DONE, there is no active node', () => {
      fc.assert(fc.property(
        fc.integer({ min: 1, max: 20 }).chain(size =>
          fc.tuple(
            ...Array.from({ length: size }, (_, i) =>
              fc.record({
                id: fc.uuid(),
                status: fc.constant('DONE' as KnotStatus),
                chainOrder: fc.constant(i),
              })
            )
          ).map(knots => knots as ChainKnot[])
        ),
        (knots) => {
          // All knots are DONE
          const activeNode = findActiveNode(knots);
          expect(activeNode).toBeUndefined();

          // Every knot should return 'done' state
          for (const k of knots) {
            expect(getNodeState(k, knots)).toBe('done');
          }
        }
      ), { numRuns: 100 });
    });
  });

  // ─── Property 9: Chain Display Order ──────────────────────────────────────

  // Feature: knot-chains, Property 9: Chain Display Order
  // **Validates: Requirements 6.8**
  describe('Property 9: Chain Display Order', () => {

    it('chains are sorted by createdAt descending (newest first)', () => {
      fc.assert(fc.property(
        fc.array(arbChain(), { minLength: 2, maxLength: 20 }),
        (chains) => {
          const sorted = sortChainsForDisplay(chains);

          // Verify descending order: each chain's createdAt >= next chain's createdAt
          for (let i = 0; i < sorted.length - 1; i++) {
            expect(sorted[i].createdAt).toBeGreaterThanOrEqual(sorted[i + 1].createdAt);
          }

          // Verify all original chains are present (same length, same elements)
          expect(sorted.length).toBe(chains.length);
          const originalIds = new Set(chains.map(c => c.id));
          const sortedIds = new Set(sorted.map(c => c.id));
          expect(sortedIds).toEqual(originalIds);
        }
      ), { numRuns: 100 });
    });

    it('single chain or empty list is trivially sorted', () => {
      fc.assert(fc.property(
        fc.oneof(
          fc.constant([] as Chain[]),
          arbChain().map(c => [c])
        ),
        (chains) => {
          const sorted = sortChainsForDisplay(chains);
          expect(sorted.length).toBe(chains.length);

          // A list of 0 or 1 elements is always sorted
          if (chains.length === 1) {
            expect(sorted[0].id).toBe(chains[0].id);
          }
        }
      ), { numRuns: 100 });
    });
  });
});

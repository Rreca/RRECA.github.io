import * as fc from 'fast-check';
import { TestBed } from '@angular/core/testing';
import { ChainService } from './chain.service';
import { StoreService } from './store.service';
import { Knot, KnotStatus, BlockReason, KnotContext } from '../models/knot.model';
import { Chain } from '../models/chain.model';

// ─── Custom Generators ─────────────────────────────────────────────────────

const STATUSES: KnotStatus[] = ['BLOCKED', 'UNLOCKABLE', 'DOING', 'DONE', 'SOMEDAY'];
const BLOCK_REASONS: BlockReason[] = ['NO_START', 'LAZINESS', 'FEAR', 'EXTERNAL', 'NOT_TODAY'];
const CONTEXTS: KnotContext[] = ['ANY', 'HOME', 'STREET', 'WORK'];

/** Generates a valid chain name: 1–50 chars with at least one non-whitespace */
function arbChainName(): fc.Arbitrary<string> {
  return fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0);
}

/** Generates a whitespace-only string (for negative tests on chain name) */
function arbWhitespaceName(): fc.Arbitrary<string> {
  return fc.array(fc.constantFrom(' ', '\t', '\n', '\r'), { minLength: 0, maxLength: 50 })
    .map(arr => arr.join(''));
}

/** Generates a valid Knot object (not assigned to any chain) */
function arbKnot(): fc.Arbitrary<Knot> {
  return fc.record({
    id: fc.uuid(),
    title: fc.string({ minLength: 1, maxLength: 50 }),
    status: fc.constantFrom(...STATUSES),
    blockReason: fc.constantFrom(...BLOCK_REASONS),
    context: fc.constantFrom(...CONTEXTS),
    weight: fc.integer({ min: 1, max: 5 }),
    impact: fc.integer({ min: 1, max: 5 }),
    nextStep: fc.option(fc.string({ minLength: 1, maxLength: 30 }), { nil: null }),
    estMinutes: fc.option(fc.integer({ min: 1, max: 120 }), { nil: null }),
    externalWait: fc.constant(null),
    createdAt: fc.integer({ min: 1_600_000_000_000, max: 1_700_000_000_000 }),
    updatedAt: fc.integer({ min: 1_600_000_000_000, max: 1_700_000_000_000 }),
    lastTouchedAt: fc.integer({ min: 1_600_000_000_000, max: 1_700_000_000_000 }),
    doneAt: fc.constant(null),
    archivedAt: fc.constant(null),
    archiveReason: fc.constant(null),
    chainId: fc.constant(null),
    chainOrder: fc.constant(null),
  }) as fc.Arbitrary<Knot>;
}

type ChainOp =
  | { type: 'add'; knotIndex: number; chainIndex: number }
  | { type: 'remove'; knotIndex: number }
  | { type: 'reorder'; chainIndex: number; from: number; to: number }
  | { type: 'move'; knotIndex: number; chainIndex: number };

// ─── Test Suite ─────────────────────────────────────────────────────────────

// Feature: knot-chains, Property Tests for ChainService
describe('ChainService Property Tests', () => {
  let chainService: ChainService;
  let storeService: StoreService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    storeService = TestBed.inject(StoreService);
    chainService = TestBed.inject(ChainService);
  });

  afterEach(() => localStorage.clear());

  // ─── Helper: execute an operation safely (catching expected errors) ────

  function executeOp(op: ChainOp, knots: Knot[], chains: Chain[]): void {
    try {
      switch (op.type) {
        case 'add': {
          const knot = knots[op.knotIndex];
          const chain = chains[op.chainIndex];
          if (knot && chain) {
            // Only add if knot is not already in a chain
            const current = storeService.getKnotById(knot.id);
            if (current && !current.chainId) {
              chainService.addKnotToChain(knot.id, chain.id);
            }
          }
          break;
        }
        case 'remove': {
          const knot = knots[op.knotIndex];
          if (knot) {
            chainService.removeKnotFromChain(knot.id);
          }
          break;
        }
        case 'reorder': {
          const chain = chains[op.chainIndex];
          if (chain) {
            const size = chainService.getChainSize(chain.id);
            if (size >= 2 && op.from < size && op.to < size && op.from !== op.to) {
              chainService.reorderKnot(chain.id, op.from, op.to);
            }
          }
          break;
        }
        case 'move': {
          const knot = knots[op.knotIndex];
          const chain = chains[op.chainIndex];
          if (knot && chain) {
            const current = storeService.getKnotById(knot.id);
            if (current && current.chainId && current.chainId !== chain.id) {
              chainService.moveKnotToChain(knot.id, chain.id);
            }
          }
          break;
        }
      }
    } catch {
      // Expected: operations may throw for invalid state (capacity, missing chain, etc.)
    }
  }

  function generateSimpleOp(
    opIdx: number,
    numKnots: number,
    numChains: number
  ): ChainOp {
    const opType = opIdx % 4;
    switch (opType) {
      case 0: return { type: 'add', knotIndex: opIdx % numKnots, chainIndex: opIdx % numChains };
      case 1: return { type: 'remove', knotIndex: opIdx % numKnots };
      case 2: return { type: 'reorder', chainIndex: opIdx % numChains, from: 0, to: 1 };
      case 3: return { type: 'move', knotIndex: opIdx % numKnots, chainIndex: opIdx % numChains };
      default: return { type: 'add', knotIndex: 0, chainIndex: 0 };
    }
  }

  // ─── Property 1: chainId/chainOrder Co-Nullity Invariant ──────────────

  // Feature: knot-chains, Property 1: chainId/chainOrder Co-Nullity Invariant
  // **Validates: Requirements 1.4**
  it('Property 1: chainId and chainOrder are both null or both non-null after random operations', () => {
    fc.assert(fc.property(
      fc.array(arbKnot(), { minLength: 2, maxLength: 8 }),
      fc.array(arbChainName(), { minLength: 1, maxLength: 3 }),
      fc.array(fc.integer({ min: 0, max: 20 }), { minLength: 1, maxLength: 10 }),
      (knotsArr, chainNames, opTypes) => {
        localStorage.clear();
        storeService.init();

        // Create knots
        for (const knot of knotsArr) {
          storeService.createKnot({ ...knot });
        }

        // Create chains and add at least one knot to each
        const chains: Chain[] = [];
        for (let i = 0; i < chainNames.length; i++) {
          try {
            const chain = chainService.createChain(chainNames[i]);
            // Add one knot to make the chain non-empty
            const knotForChain = knotsArr[i % knotsArr.length];
            const knotState = storeService.getKnotById(knotForChain.id);
            if (knotState && !knotState.chainId) {
              chainService.addKnotToChain(knotForChain.id, chain.id);
            }
            chains.push(chain);
          } catch { /* invalid name or error */ }
        }

        if (chains.length === 0) return;

        // Execute random operations
        for (const opIdx of opTypes) {
          const op = generateSimpleOp(opIdx, knotsArr.length, chains.length);
          executeOp(op, knotsArr, chains);
        }

        // Assert: co-nullity invariant
        const allKnots = storeService.getKnots();
        for (const knot of allKnots) {
          const hasChainId = knot.chainId != null;
          const hasChainOrder = knot.chainOrder != null;
          expect(hasChainId).toBe(hasChainOrder);
        }
      }
    ), { numRuns: 100 });
  });

  // ─── Property 2: Consecutive chainOrder Within a Chain ────────────────

  // Feature: knot-chains, Property 2: Consecutive chainOrder Within a Chain
  // **Validates: Requirements 1.7, 4.2, 4.4, 8.4, 9.4, 9.5**
  it('Property 2: chainOrder values form {0..N-1} with no gaps after random operations', () => {
    fc.assert(fc.property(
      fc.array(arbKnot(), { minLength: 3, maxLength: 8 }),
      fc.array(arbChainName(), { minLength: 1, maxLength: 2 }),
      fc.array(fc.integer({ min: 0, max: 20 }), { minLength: 1, maxLength: 10 }),
      (knotsArr, chainNames, opTypes) => {
        localStorage.clear();
        storeService.init();

        for (const knot of knotsArr) {
          storeService.createKnot({ ...knot });
        }

        // Create chains and seed them with knots
        const chains: Chain[] = [];
        let nextKnotIdx = 0;
        for (const name of chainNames) {
          try {
            const chain = chainService.createChain(name);
            // Add at least one knot
            if (nextKnotIdx < knotsArr.length) {
              chainService.addKnotToChain(knotsArr[nextKnotIdx].id, chain.id);
              nextKnotIdx++;
            }
            chains.push(chain);
          } catch { /* skip */ }
        }

        if (chains.length === 0) return;

        for (const opIdx of opTypes) {
          const op = generateSimpleOp(opIdx, knotsArr.length, chains.length);
          executeOp(op, knotsArr, chains);
        }

        // Assert: consecutive chainOrder for each existing chain
        const existingChains = chainService.getChains();
        for (const chain of existingChains) {
          const chainKnots = storeService.getKnots()
            .filter(k => k.chainId === chain.id)
            .sort((a, b) => (a.chainOrder ?? 0) - (b.chainOrder ?? 0));

          if (chainKnots.length === 0) continue; // empty chain about to be cleaned

          const orders = chainKnots.map(k => k.chainOrder);
          const expected = chainKnots.map((_, i) => i);
          expect(orders).toEqual(expected);
        }
      }
    ), { numRuns: 100 });
  });

  // ─── Property 3: Referential Integrity ────────────────────────────────

  // Feature: knot-chains, Property 3: Referential Integrity
  // **Validates: Requirements 8.5, 9.2, 9.4, 9.5, 9.6**
  it('Property 3: no orphan chainIds and no empty chains after operations', () => {
    fc.assert(fc.property(
      fc.array(arbKnot(), { minLength: 3, maxLength: 8 }),
      fc.array(arbChainName(), { minLength: 1, maxLength: 2 }),
      fc.array(fc.integer({ min: 0, max: 20 }), { minLength: 1, maxLength: 10 }),
      (knotsArr, chainNames, opTypes) => {
        localStorage.clear();
        storeService.init();

        for (const knot of knotsArr) {
          storeService.createKnot({ ...knot });
        }

        // Create chains and seed each with a knot
        const chains: Chain[] = [];
        let nextKnotIdx = 0;
        for (const name of chainNames) {
          try {
            const chain = chainService.createChain(name);
            if (nextKnotIdx < knotsArr.length) {
              chainService.addKnotToChain(knotsArr[nextKnotIdx].id, chain.id);
              nextKnotIdx++;
            }
            chains.push(chain);
          } catch { /* skip */ }
        }

        if (chains.length === 0) return;

        for (const opIdx of opTypes) {
          const op = generateSimpleOp(opIdx, knotsArr.length, chains.length);
          executeOp(op, knotsArr, chains);
        }

        // Run validateIntegrity to ensure consistency
        chainService.validateIntegrity();

        // Assert (a): every knot with non-null chainId references an existing chain
        const existingChainIds = new Set(chainService.getChains().map(c => c.id));
        const allKnots = storeService.getKnots();
        for (const knot of allKnots) {
          if (knot.chainId != null) {
            expect(existingChainIds.has(knot.chainId)).toBeTrue();
          }
        }

        // Assert (b): every chain has at least one knot referencing it
        for (const chain of chainService.getChains()) {
          const size = allKnots.filter(k => k.chainId === chain.id).length;
          expect(size).toBeGreaterThan(0);
        }
      }
    ), { numRuns: 100 });
  });

  // ─── Property 4: Append to End ────────────────────────────────────────

  // Feature: knot-chains, Property 4: Append to End
  // **Validates: Requirements 3.2, 3.4**
  it('Property 4: adding a knot to a chain assigns chainOrder = N and existing knots unchanged', () => {
    fc.assert(fc.property(
      fc.array(arbKnot(), { minLength: 2, maxLength: 10 }),
      fc.integer({ min: 1, max: 5 }),
      (knotsArr, numToAdd) => {
        localStorage.clear();
        storeService.init();

        for (const knot of knotsArr) {
          storeService.createKnot({ ...knot });
        }

        const chain = chainService.createChain('Test Chain');

        const actualNumToAdd = Math.min(numToAdd, knotsArr.length);

        for (let i = 0; i < actualNumToAdd; i++) {
          const knot = knotsArr[i];
          const sizeBefore = chainService.getChainSize(chain.id);

          // Snapshot existing knot orders before adding
          const existingKnotsBefore = storeService.getKnots()
            .filter(k => k.chainId === chain.id)
            .map(k => ({ id: k.id, chainOrder: k.chainOrder }));

          chainService.addKnotToChain(knot.id, chain.id);

          // The newly added knot should have chainOrder = sizeBefore
          const updatedKnot = storeService.getKnotById(knot.id)!;
          expect(updatedKnot.chainOrder).toBe(sizeBefore);

          // Existing knots should retain their original chainOrder
          for (const snapshot of existingKnotsBefore) {
            const current = storeService.getKnotById(snapshot.id)!;
            expect(current.chainOrder).toBe(snapshot.chainOrder);
          }
        }
      }
    ), { numRuns: 100 });
  });

  // ─── Property 5: Chain Name Validation ────────────────────────────────

  // Feature: knot-chains, Property 5: Chain Name Validation
  // **Validates: Requirements 2.4**
  it('Property 5: whitespace-only names rejected, valid 1-50 char names with non-whitespace accepted', () => {
    fc.assert(fc.property(
      arbWhitespaceName(),
      (wsName) => {
        localStorage.clear();
        storeService.init();

        // Whitespace-only or empty should be rejected
        expect(() => chainService.createChain(wsName)).toThrow();
      }
    ), { numRuns: 100 });

    fc.assert(fc.property(
      arbChainName(),
      (validName) => {
        localStorage.clear();
        storeService.init();

        // Valid names should succeed
        const chain = chainService.createChain(validName);
        expect(chain).toBeDefined();
        expect(chain.id).toBeTruthy();
        expect(chain.name.length).toBeGreaterThan(0);
        expect(chain.name.length).toBeLessThanOrEqual(50);
      }
    ), { numRuns: 100 });
  });

  // ─── Property 6: Chain Creation Assigns First Position ────────────────

  // Feature: knot-chains, Property 6: Chain Creation Assigns First Position
  // **Validates: Requirements 2.2**
  it('Property 6: new chain creation with first knot assigns chainOrder=0 and correct chainId', () => {
    fc.assert(fc.property(
      arbChainName(),
      arbKnot(),
      (name, knot) => {
        localStorage.clear();
        storeService.init();

        storeService.createKnot({ ...knot });

        const chain = chainService.createChain(name);
        chainService.addKnotToChain(knot.id, chain.id);

        const updatedKnot = storeService.getKnotById(knot.id)!;
        expect(updatedKnot.chainId).toBe(chain.id);
        expect(updatedKnot.chainOrder).toBe(0);
      }
    ), { numRuns: 100 });
  });

  // ─── Property 14: Reorder Correctness ─────────────────────────────────

  // Feature: knot-chains, Property 14: Reorder Correctness
  // **Validates: Requirements 4.2**
  it('Property 14: reorder moves item to target index and sequence remains {0..N-1}', () => {
    fc.assert(fc.property(
      fc.array(arbKnot(), { minLength: 2, maxLength: 10 }),
      fc.nat(),
      fc.nat(),
      (knotsArr, fromRaw, toRaw) => {
        localStorage.clear();
        storeService.init();

        for (const knot of knotsArr) {
          storeService.createKnot({ ...knot });
        }

        const chain = chainService.createChain('Reorder Chain');

        // Add all knots to the chain
        for (const knot of knotsArr) {
          chainService.addKnotToChain(knot.id, chain.id);
        }

        const N = knotsArr.length;
        const fromIndex = fromRaw % N;
        const toIndex = toRaw % N;

        if (fromIndex === toIndex) return; // No-op, skip

        // Get the knot that will be moved
        const knotsBefore = chainService.getChainKnots(chain.id);
        const movedKnotId = knotsBefore[fromIndex].id;

        chainService.reorderKnot(chain.id, fromIndex, toIndex);

        // Assert: moved knot is now at toIndex
        const knotsAfter = chainService.getChainKnots(chain.id);
        expect(knotsAfter[toIndex].id).toBe(movedKnotId);

        // Assert: chainOrder values are {0..N-1}
        const orders = knotsAfter.map(k => k.chainOrder);
        const expected = knotsAfter.map((_, i) => i);
        expect(orders).toEqual(expected);
      }
    ), { numRuns: 100 });
  });

  // ─── Property 15: Move Between Chains ─────────────────────────────────

  // Feature: knot-chains, Property 15: Move Between Chains
  // **Validates: Requirements 3.6**
  it('Property 15: move between chains maintains consecutive order and appends at end', () => {
    fc.assert(fc.property(
      fc.array(arbKnot(), { minLength: 2, maxLength: 6 }),
      fc.array(arbKnot(), { minLength: 1, maxLength: 6 }),
      fc.integer({ min: 0, max: 5 }),
      (sourceKnots, targetKnots, moveIdxRaw) => {
        localStorage.clear();
        storeService.init();

        // Create all knots
        for (const knot of sourceKnots) {
          storeService.createKnot({ ...knot });
        }
        for (const knot of targetKnots) {
          storeService.createKnot({ ...knot });
        }

        // Create two chains
        const chainA = chainService.createChain('Source Chain');
        const chainB = chainService.createChain('Target Chain');

        // Add knots to respective chains
        for (const knot of sourceKnots) {
          chainService.addKnotToChain(knot.id, chainA.id);
        }
        for (const knot of targetKnots) {
          chainService.addKnotToChain(knot.id, chainB.id);
        }

        const moveIdx = moveIdxRaw % sourceKnots.length;
        const movedKnotId = sourceKnots[moveIdx].id;
        const targetSizeBefore = chainService.getChainSize(chainB.id);

        chainService.moveKnotToChain(movedKnotId, chainB.id);

        // Assert (a): source chain has consecutive chainOrder 0..N-2
        const remainingSource = storeService.getKnots()
          .filter(k => k.chainId === chainA.id)
          .sort((a, b) => (a.chainOrder ?? 0) - (b.chainOrder ?? 0));

        if (remainingSource.length > 0) {
          const sourceOrders = remainingSource.map(k => k.chainOrder);
          const expectedSource = remainingSource.map((_, i) => i);
          expect(sourceOrders).toEqual(expectedSource);
        }

        // Assert (b): moved knot is at the last position of target chain
        const movedKnot = storeService.getKnotById(movedKnotId)!;
        expect(movedKnot.chainId).toBe(chainB.id);
        expect(movedKnot.chainOrder).toBe(targetSizeBefore);

        // Assert (c): if source becomes empty, chain A is deleted
        if (sourceKnots.length === 1) {
          expect(chainService.getChainById(chainA.id)).toBeUndefined();
        }

        // Assert: target chain has consecutive chainOrder
        const targetKnotsAfter = storeService.getKnots()
          .filter(k => k.chainId === chainB.id)
          .sort((a, b) => (a.chainOrder ?? 0) - (b.chainOrder ?? 0));
        const targetOrders = targetKnotsAfter.map(k => k.chainOrder);
        const expectedTarget = targetKnotsAfter.map((_, i) => i);
        expect(targetOrders).toEqual(expectedTarget);
      }
    ), { numRuns: 100 });
  });
});

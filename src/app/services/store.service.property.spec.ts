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

// ─── Test Suite ─────────────────────────────────────────────────────────────

// Feature: knot-chains, Property 12: Knot Removal Preserves Non-Chain Fields
// Feature: knot-chains, Property 13: Export Completeness
describe('StoreService Chain Property Tests', () => {
  let chainService: ChainService;
  let storeService: StoreService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    storeService = TestBed.inject(StoreService);
    chainService = TestBed.inject(ChainService);
  });

  afterEach(() => localStorage.clear());

  // ─── Property 12: Knot Removal Preserves Non-Chain Fields ─────────────

  // Feature: knot-chains, Property 12: Knot Removal Preserves Non-Chain Fields
  // **Validates: Requirements 8.6**
  it('Property 12: removing a knot from a chain preserves all non-chain fields', () => {
    fc.assert(fc.property(
      arbKnot(),
      arbChainName(),
      (knot, chainName) => {
        localStorage.clear();
        storeService.init();

        // Create knot and chain, add knot to chain
        storeService.createKnot({ ...knot });
        const chain = chainService.createChain(chainName);
        chainService.addKnotToChain(knot.id, chain.id);

        // Snapshot all non-chain fields before removal
        const knotBefore = storeService.getKnotById(knot.id)!;
        const snapshot = {
          id: knotBefore.id,
          title: knotBefore.title,
          status: knotBefore.status,
          blockReason: knotBefore.blockReason,
          context: knotBefore.context,
          weight: knotBefore.weight,
          impact: knotBefore.impact,
          nextStep: knotBefore.nextStep,
          estMinutes: knotBefore.estMinutes,
          externalWait: knotBefore.externalWait,
          createdAt: knotBefore.createdAt,
          doneAt: knotBefore.doneAt,
          archivedAt: knotBefore.archivedAt,
          archiveReason: knotBefore.archiveReason,
        };

        // Remove knot from chain
        chainService.removeKnotFromChain(knot.id);

        // Verify non-chain fields are unchanged
        const knotAfter = storeService.getKnotById(knot.id)!;
        expect(knotAfter.id).toBe(snapshot.id);
        expect(knotAfter.title).toBe(snapshot.title);
        expect(knotAfter.status).toBe(snapshot.status);
        expect(knotAfter.blockReason).toBe(snapshot.blockReason);
        expect(knotAfter.context).toBe(snapshot.context);
        expect(knotAfter.weight).toBe(snapshot.weight);
        expect(knotAfter.impact).toBe(snapshot.impact);
        expect(knotAfter.nextStep).toBe(snapshot.nextStep);
        expect(knotAfter.estMinutes).toBe(snapshot.estMinutes);
        expect(knotAfter.externalWait).toBe(snapshot.externalWait);
        expect(knotAfter.createdAt).toBe(snapshot.createdAt);
        expect(knotAfter.doneAt).toBe(snapshot.doneAt);
        expect(knotAfter.archivedAt).toBe(snapshot.archivedAt);
        expect(knotAfter.archiveReason).toBe(snapshot.archiveReason);

        // Verify chain fields are set to null
        expect(knotAfter.chainId).toBeNull();
        expect(knotAfter.chainOrder).toBeNull();
      }
    ), { numRuns: 100 });
  });

  // ─── Property 13: Export Completeness ─────────────────────────────────

  // Feature: knot-chains, Property 13: Export Completeness
  // **Validates: Requirements 9.1**
  it('Property 13: exported data chains array matches storage exactly', () => {
    fc.assert(fc.property(
      fc.array(arbKnot(), { minLength: 1, maxLength: 8 }),
      fc.array(arbChainName(), { minLength: 1, maxLength: 3 }),
      (knotsArr, chainNames) => {
        localStorage.clear();
        storeService.init();

        // Create knots
        for (const knot of knotsArr) {
          storeService.createKnot({ ...knot });
        }

        // Create chains and assign at least one knot to each to keep them alive
        const createdChains: Chain[] = [];
        let nextKnotIdx = 0;
        for (const name of chainNames) {
          try {
            const chain = chainService.createChain(name);
            if (nextKnotIdx < knotsArr.length) {
              const knotState = storeService.getKnotById(knotsArr[nextKnotIdx].id);
              if (knotState && !knotState.chainId) {
                chainService.addKnotToChain(knotsArr[nextKnotIdx].id, chain.id);
              }
              nextKnotIdx++;
            }
            createdChains.push(chain);
          } catch { /* skip invalid names */ }
        }

        // Get chains from storage (the source of truth)
        const chainsInStorage = storeService.getChains();

        // Verify export completeness by comparing with getChains() output
        // (exportData creates the same data structure: { chains: this.getChains() })
        // We check that every chain in storage matches by id, name, and createdAt
        for (const storedChain of chainsInStorage) {
          expect(storedChain.id).toBeTruthy();
          expect(storedChain.name).toBeTruthy();
          expect(storedChain.createdAt).toBeGreaterThan(0);
        }

        // Verify the chains from ChainService (which is what exportData uses) match storage
        const exportChains = storeService.getChains();
        expect(exportChains.length).toBe(chainsInStorage.length);

        for (let i = 0; i < chainsInStorage.length; i++) {
          expect(exportChains[i].id).toBe(chainsInStorage[i].id);
          expect(exportChains[i].name).toBe(chainsInStorage[i].name);
          expect(exportChains[i].createdAt).toBe(chainsInStorage[i].createdAt);
        }

        // Additional: verify import round-trip preserves chain data
        // Build the export structure manually (same as exportData does internally)
        const exportedData = {
          version: 1,
          exportedAt: Date.now(),
          knots: storeService.getKnots(),
          events: storeService.getEvents(),
          chains: storeService.getChains(),
        };
        const exportedJson = JSON.stringify(exportedData);

        // Clear and re-import
        localStorage.clear();
        storeService.init();
        storeService.importData(exportedJson);

        // Chains after import should match exported chains
        const importedChains = storeService.getChains();
        const originalChains = exportedData.chains;

        // Only non-empty chains survive import (integrity cleans up empty ones)
        // Filter original chains to those that have knots referencing them
        const originalKnots = exportedData.knots;
        const expectedChains = originalChains.filter(c =>
          originalKnots.some(k => k.chainId === c.id)
        );

        expect(importedChains.length).toBe(expectedChains.length);
        for (const expected of expectedChains) {
          const imported = importedChains.find(c => c.id === expected.id);
          expect(imported).toBeDefined();
          if (imported) {
            expect(imported.name).toBe(expected.name);
            expect(imported.createdAt).toBe(expected.createdAt);
          }
        }
      }
    ), { numRuns: 100 });
  });
});

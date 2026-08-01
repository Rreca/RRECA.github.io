import { TestBed } from '@angular/core/testing';
import { ChainService } from './chain.service';
import { StoreService } from './store.service';
import { Knot } from '../models/knot.model';
import { Chain } from '../models/chain.model';

function makeKnot(overrides: Partial<Knot> = {}): Knot {
  const now = Date.now();
  return {
    id: 'test-' + Math.random().toString(36).slice(2),
    title: 'Knot de prueba',
    status: 'UNLOCKABLE',
    blockReason: 'LAZINESS',
    context: 'ANY',
    weight: 3,
    impact: 3,
    nextStep: 'Hacer algo',
    estMinutes: 5,
    externalWait: null,
    createdAt: now,
    updatedAt: now,
    lastTouchedAt: now,
    doneAt: null,
    archivedAt: null,
    archiveReason: null,
    ...overrides,
  };
}

function makeChain(overrides: Partial<Chain> = {}): Chain {
  return {
    id: 'chain-' + Math.random().toString(36).slice(2),
    name: 'Cadena de prueba',
    createdAt: Date.now(),
    ...overrides,
  };
}

describe('ChainService', () => {
  let chainService: ChainService;
  let storeService: StoreService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    storeService = TestBed.inject(StoreService);
    chainService = TestBed.inject(ChainService);
  });

  afterEach(() => localStorage.clear());

  // ─── addKnotToChain ─────────────────────────────────────────────────────
  describe('addKnotToChain', () => {
    it('should assign a knot to the last position in the chain', () => {
      const chain = makeChain({ id: 'c1' });
      localStorage.setItem('nudos_v1_chains', JSON.stringify([chain]));
      // Re-initialize to pick up the chain
      chainService = TestBed.inject(ChainService);

      const k1 = makeKnot({ id: 'k1' });
      const k2 = makeKnot({ id: 'k2' });
      storeService.createKnot(k1);
      storeService.createKnot(k2);

      chainService.addKnotToChain('k1', 'c1');
      const updatedK1 = storeService.getKnotById('k1')!;
      expect(updatedK1.chainId).toBe('c1');
      expect(updatedK1.chainOrder).toBe(0);

      chainService.addKnotToChain('k2', 'c1');
      const updatedK2 = storeService.getKnotById('k2')!;
      expect(updatedK2.chainId).toBe('c1');
      expect(updatedK2.chainOrder).toBe(1);
    });

    it('should throw when chain does not exist', () => {
      const k = makeKnot({ id: 'k1' });
      storeService.createKnot(k);
      expect(() => chainService.addKnotToChain('k1', 'nonexistent'))
        .toThrowError('La cadena no existe');
    });

    it('should throw when knot does not exist', () => {
      const chain = makeChain({ id: 'c1' });
      localStorage.setItem('nudos_v1_chains', JSON.stringify([chain]));
      chainService = TestBed.inject(ChainService);

      expect(() => chainService.addKnotToChain('nonexistent', 'c1'))
        .toThrowError('El nudo no existe');
    });

    it('should throw when chain has 50 knots (max capacity)', () => {
      const chain = makeChain({ id: 'c-full' });
      localStorage.setItem('nudos_v1_chains', JSON.stringify([chain]));

      // Create 50 knots already in the chain
      const knots: Knot[] = [];
      for (let i = 0; i < 50; i++) {
        knots.push(makeKnot({ id: `k${i}`, chainId: 'c-full', chainOrder: i }));
      }
      const extraKnot = makeKnot({ id: 'k-extra' });
      knots.push(extraKnot);
      localStorage.setItem('nudos_v1_knots', JSON.stringify(knots));
      localStorage.setItem('nudos_v1_events', JSON.stringify([]));

      // Re-initialize services
      storeService = TestBed.inject(StoreService);
      storeService.init();
      chainService = TestBed.inject(ChainService);

      expect(() => chainService.addKnotToChain('k-extra', 'c-full'))
        .toThrowError('Esta cadena alcanzó su capacidad máxima (50 nudos)');
    });

    it('should log KNOT_ADDED_TO_CHAIN event', () => {
      const chain = makeChain({ id: 'c1' });
      localStorage.setItem('nudos_v1_chains', JSON.stringify([chain]));
      chainService = TestBed.inject(ChainService);

      const k = makeKnot({ id: 'k1' });
      storeService.createKnot(k);
      chainService.addKnotToChain('k1', 'c1');

      const events = storeService.getEvents();
      expect(events.some(e => e.type === 'KNOT_ADDED_TO_CHAIN' &&
        (e.meta as Record<string, unknown>)['knotId'] === 'k1' &&
        (e.meta as Record<string, unknown>)['chainId'] === 'c1'
      )).toBeTrue();
    });
  });

  // ─── removeKnotFromChain ────────────────────────────────────────────────
  describe('removeKnotFromChain', () => {
    it('should set chainId and chainOrder to null', () => {
      const chain = makeChain({ id: 'c1' });
      localStorage.setItem('nudos_v1_chains', JSON.stringify([chain]));

      const k = makeKnot({ id: 'k1', chainId: 'c1', chainOrder: 0 });
      const k2 = makeKnot({ id: 'k2', chainId: 'c1', chainOrder: 1 });
      localStorage.setItem('nudos_v1_knots', JSON.stringify([k, k2]));
      localStorage.setItem('nudos_v1_events', JSON.stringify([]));

      storeService.init();
      chainService = TestBed.inject(ChainService);

      chainService.removeKnotFromChain('k1');

      const updated = storeService.getKnotById('k1')!;
      expect(updated.chainId).toBeNull();
      expect(updated.chainOrder).toBeNull();
    });

    it('should recalculate consecutive chainOrder for remaining knots', () => {
      const chain = makeChain({ id: 'c1' });
      localStorage.setItem('nudos_v1_chains', JSON.stringify([chain]));

      const k1 = makeKnot({ id: 'k1', chainId: 'c1', chainOrder: 0 });
      const k2 = makeKnot({ id: 'k2', chainId: 'c1', chainOrder: 1 });
      const k3 = makeKnot({ id: 'k3', chainId: 'c1', chainOrder: 2 });
      localStorage.setItem('nudos_v1_knots', JSON.stringify([k1, k2, k3]));
      localStorage.setItem('nudos_v1_events', JSON.stringify([]));

      storeService.init();
      chainService = TestBed.inject(ChainService);

      // Remove the middle knot
      chainService.removeKnotFromChain('k2');

      const updatedK1 = storeService.getKnotById('k1')!;
      const updatedK3 = storeService.getKnotById('k3')!;
      expect(updatedK1.chainOrder).toBe(0);
      expect(updatedK3.chainOrder).toBe(1);
    });

    it('should delete the chain record when last knot is removed', () => {
      const chain = makeChain({ id: 'c1' });
      localStorage.setItem('nudos_v1_chains', JSON.stringify([chain]));

      const k = makeKnot({ id: 'k1', chainId: 'c1', chainOrder: 0 });
      localStorage.setItem('nudos_v1_knots', JSON.stringify([k]));
      localStorage.setItem('nudos_v1_events', JSON.stringify([]));

      storeService.init();
      chainService = TestBed.inject(ChainService);

      chainService.removeKnotFromChain('k1');

      expect(chainService.getChainById('c1')).toBeUndefined();
      const storedChains = JSON.parse(localStorage.getItem('nudos_v1_chains') ?? '[]');
      expect(storedChains.length).toBe(0);
    });

    it('should preserve the knot as independent (non-chain fields unchanged)', () => {
      const chain = makeChain({ id: 'c1' });
      localStorage.setItem('nudos_v1_chains', JSON.stringify([chain]));

      const k = makeKnot({
        id: 'k1',
        title: 'Título original',
        status: 'DOING',
        weight: 4,
        impact: 5,
        chainId: 'c1',
        chainOrder: 0,
      });
      const k2 = makeKnot({ id: 'k2', chainId: 'c1', chainOrder: 1 });
      localStorage.setItem('nudos_v1_knots', JSON.stringify([k, k2]));
      localStorage.setItem('nudos_v1_events', JSON.stringify([]));

      storeService.init();
      chainService = TestBed.inject(ChainService);

      chainService.removeKnotFromChain('k1');

      const updated = storeService.getKnotById('k1')!;
      expect(updated.title).toBe('Título original');
      expect(updated.status).toBe('DOING');
      expect(updated.weight).toBe(4);
      expect(updated.impact).toBe(5);
      expect(updated.chainId).toBeNull();
      expect(updated.chainOrder).toBeNull();
    });

    it('should throw when knot does not exist', () => {
      expect(() => chainService.removeKnotFromChain('nonexistent'))
        .toThrowError('El nudo no existe');
    });

    it('should throw when knot has no chainId', () => {
      const k = makeKnot({ id: 'k1', chainId: null, chainOrder: null });
      storeService.createKnot(k);

      expect(() => chainService.removeKnotFromChain('k1'))
        .toThrowError('El nudo no pertenece a ninguna cadena');
    });

    it('should log KNOT_REMOVED_FROM_CHAIN event', () => {
      const chain = makeChain({ id: 'c1' });
      localStorage.setItem('nudos_v1_chains', JSON.stringify([chain]));

      const k = makeKnot({ id: 'k1', chainId: 'c1', chainOrder: 0 });
      const k2 = makeKnot({ id: 'k2', chainId: 'c1', chainOrder: 1 });
      localStorage.setItem('nudos_v1_knots', JSON.stringify([k, k2]));
      localStorage.setItem('nudos_v1_events', JSON.stringify([]));

      storeService.init();
      chainService = TestBed.inject(ChainService);

      chainService.removeKnotFromChain('k1');

      const events = storeService.getEvents();
      expect(events.some(e => e.type === 'KNOT_REMOVED_FROM_CHAIN' &&
        (e.meta as Record<string, unknown>)['knotId'] === 'k1' &&
        (e.meta as Record<string, unknown>)['chainId'] === 'c1'
      )).toBeTrue();
    });
  });

  // ─── moveKnotToChain ────────────────────────────────────────────────────
  describe('moveKnotToChain', () => {
    it('should move a knot from one chain to the last position of another', () => {
      const chainA = makeChain({ id: 'cA' });
      const chainB = makeChain({ id: 'cB' });
      localStorage.setItem('nudos_v1_chains', JSON.stringify([chainA, chainB]));

      const k1 = makeKnot({ id: 'k1', chainId: 'cA', chainOrder: 0 });
      const k2 = makeKnot({ id: 'k2', chainId: 'cA', chainOrder: 1 });
      const k3 = makeKnot({ id: 'k3', chainId: 'cB', chainOrder: 0 });
      localStorage.setItem('nudos_v1_knots', JSON.stringify([k1, k2, k3]));
      localStorage.setItem('nudos_v1_events', JSON.stringify([]));

      storeService.init();
      chainService = TestBed.inject(ChainService);

      chainService.moveKnotToChain('k1', 'cB');

      const movedKnot = storeService.getKnotById('k1')!;
      expect(movedKnot.chainId).toBe('cB');
      expect(movedKnot.chainOrder).toBe(1); // appended after k3 (position 0)

      // Remaining knot in chain A should be recalculated
      const remainingKnot = storeService.getKnotById('k2')!;
      expect(remainingKnot.chainId).toBe('cA');
      expect(remainingKnot.chainOrder).toBe(0);
    });

    it('should delete old chain if it becomes empty after move', () => {
      const chainA = makeChain({ id: 'cA' });
      const chainB = makeChain({ id: 'cB' });
      localStorage.setItem('nudos_v1_chains', JSON.stringify([chainA, chainB]));

      const k1 = makeKnot({ id: 'k1', chainId: 'cA', chainOrder: 0 });
      const k2 = makeKnot({ id: 'k2', chainId: 'cB', chainOrder: 0 });
      localStorage.setItem('nudos_v1_knots', JSON.stringify([k1, k2]));
      localStorage.setItem('nudos_v1_events', JSON.stringify([]));

      storeService.init();
      chainService = TestBed.inject(ChainService);

      chainService.moveKnotToChain('k1', 'cB');

      // Old chain should be deleted
      expect(chainService.getChainById('cA')).toBeUndefined();

      // Knot should be in new chain
      const movedKnot = storeService.getKnotById('k1')!;
      expect(movedKnot.chainId).toBe('cB');
      expect(movedKnot.chainOrder).toBe(1);
    });

    it('should throw when knot does not exist', () => {
      expect(() => chainService.moveKnotToChain('nonexistent', 'c1'))
        .toThrowError('El nudo no existe');
    });

    it('should throw when knot has no current chain', () => {
      const k = makeKnot({ id: 'k1', chainId: null, chainOrder: null });
      storeService.createKnot(k);

      const chain = makeChain({ id: 'cB' });
      localStorage.setItem('nudos_v1_chains', JSON.stringify([chain]));
      chainService = TestBed.inject(ChainService);

      expect(() => chainService.moveKnotToChain('k1', 'cB'))
        .toThrowError('El nudo no pertenece a ninguna cadena');
    });

    it('should throw when destination chain does not exist', () => {
      const chainA = makeChain({ id: 'cA' });
      localStorage.setItem('nudos_v1_chains', JSON.stringify([chainA]));

      const k = makeKnot({ id: 'k1', chainId: 'cA', chainOrder: 0 });
      const k2 = makeKnot({ id: 'k2', chainId: 'cA', chainOrder: 1 });
      localStorage.setItem('nudos_v1_knots', JSON.stringify([k, k2]));
      localStorage.setItem('nudos_v1_events', JSON.stringify([]));

      storeService.init();
      chainService = TestBed.inject(ChainService);

      expect(() => chainService.moveKnotToChain('k1', 'nonexistent'))
        .toThrowError('La cadena destino no existe');
    });

    it('should throw when destination chain is at max capacity', () => {
      const chainA = makeChain({ id: 'cA' });
      const chainB = makeChain({ id: 'cB' });
      localStorage.setItem('nudos_v1_chains', JSON.stringify([chainA, chainB]));

      // Chain B has 50 knots
      const knots: Knot[] = [];
      for (let i = 0; i < 50; i++) {
        knots.push(makeKnot({ id: `kb${i}`, chainId: 'cB', chainOrder: i }));
      }
      // Chain A has our knot to move
      knots.push(makeKnot({ id: 'k-move', chainId: 'cA', chainOrder: 0 }));
      knots.push(makeKnot({ id: 'k-stay', chainId: 'cA', chainOrder: 1 }));
      localStorage.setItem('nudos_v1_knots', JSON.stringify(knots));
      localStorage.setItem('nudos_v1_events', JSON.stringify([]));

      storeService.init();
      chainService = TestBed.inject(ChainService);

      expect(() => chainService.moveKnotToChain('k-move', 'cB'))
        .toThrowError('Esta cadena alcanzó su capacidad máxima (50 nudos)');
    });

    it('should log both KNOT_REMOVED_FROM_CHAIN and KNOT_ADDED_TO_CHAIN events', () => {
      const chainA = makeChain({ id: 'cA' });
      const chainB = makeChain({ id: 'cB' });
      localStorage.setItem('nudos_v1_chains', JSON.stringify([chainA, chainB]));

      const k1 = makeKnot({ id: 'k1', chainId: 'cA', chainOrder: 0 });
      const k2 = makeKnot({ id: 'k2', chainId: 'cA', chainOrder: 1 });
      const k3 = makeKnot({ id: 'k3', chainId: 'cB', chainOrder: 0 });
      localStorage.setItem('nudos_v1_knots', JSON.stringify([k1, k2, k3]));
      localStorage.setItem('nudos_v1_events', JSON.stringify([]));

      storeService.init();
      chainService = TestBed.inject(ChainService);

      chainService.moveKnotToChain('k1', 'cB');

      const events = storeService.getEvents();
      expect(events.some(e => e.type === 'KNOT_REMOVED_FROM_CHAIN' &&
        (e.meta as Record<string, unknown>)['knotId'] === 'k1' &&
        (e.meta as Record<string, unknown>)['chainId'] === 'cA'
      )).toBeTrue();
      expect(events.some(e => e.type === 'KNOT_ADDED_TO_CHAIN' &&
        (e.meta as Record<string, unknown>)['knotId'] === 'k1' &&
        (e.meta as Record<string, unknown>)['chainId'] === 'cB'
      )).toBeTrue();
    });
  });
});

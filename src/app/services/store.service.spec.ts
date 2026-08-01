import { TestBed } from '@angular/core/testing';
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

describe('StoreService', () => {
  let service: StoreService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    service = TestBed.inject(StoreService);
  });

  afterEach(() => localStorage.clear());

  // ─── Init ───────────────────────────────────────────────────────────────
  describe('init', () => {
    it('should initialize with empty knots array', () => {
      expect(service.getKnots()).toEqual([]);
    });

    it('should emit empty array on knots$', (done) => {
      service.knots$.subscribe(knots => {
        expect(Array.isArray(knots)).toBeTrue();
        done();
      });
    });
  });

  // ─── createKnot ─────────────────────────────────────────────────────────
  describe('createKnot', () => {
    it('should add a knot to the list', () => {
      const k = makeKnot();
      service.createKnot(k);
      expect(service.getKnots().length).toBe(1);
    });

    it('should persist the knot in localStorage', () => {
      const k = makeKnot({ title: 'Persistido' });
      service.createKnot(k);
      const stored = JSON.parse(localStorage.getItem('nudos_v1_knots') ?? '[]') as Knot[];
      expect(stored.some(x => x.title === 'Persistido')).toBeTrue();
    });

    it('should normalize weight from string to number', () => {
      const k = makeKnot({ weight: '2' as unknown as number });
      service.createKnot(k);
      expect(service.getKnots()[0].weight).toBe(2);
    });

    it('should normalize impact from string to number', () => {
      const k = makeKnot({ impact: '4' as unknown as number });
      service.createKnot(k);
      expect(service.getKnots()[0].impact).toBe(4);
    });

    it('should emit updated knots$ after creation', (done) => {
      const k = makeKnot();
      let count = 0;
      service.knots$.subscribe(knots => {
        count++;
        if (count === 2) {
          expect(knots.length).toBe(1);
          done();
        }
      });
      service.createKnot(k);
    });
  });

  // ─── getKnotById ────────────────────────────────────────────────────────
  describe('getKnotById', () => {
    it('should return the knot with the matching id', () => {
      const k = makeKnot({ id: 'abc123' });
      service.createKnot(k);
      expect(service.getKnotById('abc123')?.id).toBe('abc123');
    });

    it('should return undefined for a non-existent id', () => {
      expect(service.getKnotById('no-existe')).toBeUndefined();
    });
  });

  // ─── updateKnot ─────────────────────────────────────────────────────────
  describe('updateKnot', () => {
    it('should update the title of an existing knot', () => {
      const k = makeKnot({ id: 'u1' });
      service.createKnot(k);
      service.updateKnot({ id: 'u1', title: 'Actualizado' });
      expect(service.getKnotById('u1')?.title).toBe('Actualizado');
    });

    it('should update updatedAt and lastTouchedAt', () => {
      const oldTime = Date.now() - 10000;
      const k = makeKnot({ id: 'u2', updatedAt: oldTime, lastTouchedAt: oldTime });
      service.createKnot(k);
      service.updateKnot({ id: 'u2', title: 'Changed' });
      const updated = service.getKnotById('u2')!;
      expect(updated.updatedAt).toBeGreaterThan(oldTime);
      expect(updated.lastTouchedAt).toBeGreaterThan(oldTime);
    });

    it('should log STATUS_CHANGED event when status changes', () => {
      const k = makeKnot({ id: 'u3', status: 'UNLOCKABLE' });
      service.createKnot(k);
      service.updateKnot({ id: 'u3', status: 'DOING' });
      const events = service.getEvents();
      expect(events.some(e => e.type === 'STATUS_CHANGED')).toBeTrue();
    });

    it('should do nothing for a non-existent id', () => {
      expect(() => service.updateKnot({ id: 'ghost', title: 'X' })).not.toThrow();
    });
  });

  // ─── deleteKnot ─────────────────────────────────────────────────────────
  describe('deleteKnot', () => {
    it('should remove the knot from the list', () => {
      const k = makeKnot({ id: 'd1' });
      service.createKnot(k);
      service.deleteKnot('d1');
      expect(service.getKnotById('d1')).toBeUndefined();
    });

    it('should log KNOT_DELETED event', () => {
      const k = makeKnot({ id: 'd2' });
      service.createKnot(k);
      service.deleteKnot('d2');
      expect(service.getEvents().some(e => e.type === 'KNOT_DELETED')).toBeTrue();
    });

    it('should not throw when deleting non-existent knot', () => {
      expect(() => service.deleteKnot('nope')).not.toThrow();
    });
  });

  // ─── importData ─────────────────────────────────────────────────────────
  describe('importData', () => {
    it('should import knots from a valid JSON string', () => {
      const k = makeKnot({ id: 'imp1' });
      const payload = JSON.stringify({ knots: [k], events: [] });
      service.importData(payload);
      expect(service.getKnots().some(x => x.id === 'imp1')).toBeTrue();
    });

    it('should throw for invalid JSON', () => {
      expect(() => service.importData('not json')).toThrow();
    });

    it('should throw when knots field is missing', () => {
      expect(() => service.importData(JSON.stringify({ events: [] }))).toThrow();
    });

    it('should normalize weight and impact during import', () => {
      const k = makeKnot({ weight: '2' as unknown as number, impact: '4' as unknown as number });
      const payload = JSON.stringify({ knots: [k], events: [] });
      service.importData(payload);
      const imported = service.getKnots()[0];
      expect(typeof imported.weight).toBe('number');
      expect(typeof imported.impact).toBe('number');
    });
  });

  // ─── resetAll ───────────────────────────────────────────────────────────
  describe('resetAll', () => {
    it('should clear all knots', () => {
      service.createKnot(makeKnot());
      service.resetAll();
      expect(service.getKnots()).toEqual([]);
    });

    it('should emit empty array on knots$ after reset', (done) => {
      service.createKnot(makeKnot());
      let count = 0;
      service.knots$.subscribe(knots => {
        count++;
        if (count === 2) {
          expect(knots.length).toBe(0);
          done();
        }
      });
      service.resetAll();
    });

    it('should remove nudos_ prefixed localStorage keys', () => {
      localStorage.setItem('nudos_custom_key', 'value');
      service.resetAll();
      expect(localStorage.getItem('nudos_custom_key')).toBeNull();
    });
  });

  // ─── logEvent ───────────────────────────────────────────────────────────
  describe('logEvent', () => {
    it('should add an event to the events list', () => {
      service.logEvent('KNOT_CREATED', { knotId: 'x1' });
      const events = service.getEvents();
      expect(events.some(e => e.type === 'KNOT_CREATED')).toBeTrue();
    });

    it('should include meta data in the event', () => {
      service.logEvent('KNOT_DONE', { knotId: 'x2', feltLighter: true });
      const events = service.getEvents();
      const ev = events.find(e => e.type === 'KNOT_DONE');
      expect((ev?.meta as Record<string, unknown>)['feltLighter']).toBeTrue();
    });
  });

  // ─── cleanupDoneKnots ────────────────────────────────────────────────────
  describe('cleanup of old DONE knots', () => {
    it('should remove DONE knots older than 7 days on init', () => {
      const old = makeKnot({
        id: 'old1',
        status: 'DONE',
        doneAt: Date.now() - 8 * 24 * 60 * 60 * 1000,
      });
      localStorage.setItem('nudos_v1_knots', JSON.stringify([old]));
      localStorage.setItem('nudos_v1_events', JSON.stringify([]));

      // Re-init service to trigger cleanup
      const freshService = new StoreService();
      expect(freshService.getKnotById('old1')).toBeUndefined();
    });

    it('should keep DONE knots newer than 7 days', () => {
      const fresh = makeKnot({
        id: 'fresh1',
        status: 'DONE',
        doneAt: Date.now() - 2 * 24 * 60 * 60 * 1000,
      });
      localStorage.setItem('nudos_v1_knots', JSON.stringify([fresh]));
      localStorage.setItem('nudos_v1_events', JSON.stringify([]));

      const freshService = new StoreService();
      expect(freshService.getKnotById('fresh1')).toBeTruthy();
    });
  });

  // ─── Import/Export with Chains ──────────────────────────────────────────
  describe('import/export with chains', () => {
    it('should include chains array in exported data', () => {
      const chain: Chain = { id: 'chain-1', name: 'Mi cadena', createdAt: Date.now() };
      service.saveChains([chain]);

      // We can't easily test exportData() since it triggers a download,
      // but we can verify getChains() is included in the export structure
      expect(service.getChains()).toEqual([chain]);
    });

    it('should restore chains from imported JSON', () => {
      const chain: Chain = { id: 'chain-imp', name: 'Importada', createdAt: 1700000000000 };
      const knot = makeKnot({ id: 'k1', chainId: 'chain-imp', chainOrder: 0 });
      const payload = JSON.stringify({ knots: [knot], events: [], chains: [chain] });

      service.importData(payload);

      expect(service.getChains().length).toBe(1);
      expect(service.getChains()[0].id).toBe('chain-imp');
      expect(service.getKnots()[0].chainId).toBe('chain-imp');
      expect(service.getKnots()[0].chainOrder).toBe(0);
    });

    it('should treat missing chains array as empty and clear orphan chainIds', () => {
      const knot = makeKnot({ id: 'k-orphan', chainId: 'nonexistent-chain', chainOrder: 0 });
      const payload = JSON.stringify({ knots: [knot], events: [] });

      service.importData(payload);

      expect(service.getChains()).toEqual([]);
      const imported = service.getKnots().find(k => k.id === 'k-orphan');
      expect(imported?.chainId).toBeNull();
      expect(imported?.chainOrder).toBeNull();
    });

    it('should clear orphan chainIds referencing non-existent chains on import', () => {
      const chain: Chain = { id: 'chain-real', name: 'Real', createdAt: 1700000000000 };
      const knotValid = makeKnot({ id: 'k-valid', chainId: 'chain-real', chainOrder: 0 });
      const knotOrphan = makeKnot({ id: 'k-orphan2', chainId: 'chain-ghost', chainOrder: 1 });
      const payload = JSON.stringify({ knots: [knotValid, knotOrphan], events: [], chains: [chain] });

      service.importData(payload);

      const validKnot = service.getKnots().find(k => k.id === 'k-valid');
      const orphanKnot = service.getKnots().find(k => k.id === 'k-orphan2');
      expect(validKnot?.chainId).toBe('chain-real');
      expect(orphanKnot?.chainId).toBeNull();
      expect(orphanKnot?.chainOrder).toBeNull();
    });

    it('should delete chains with no member knots after import', () => {
      const chain1: Chain = { id: 'chain-with-knots', name: 'Llena', createdAt: 1700000000000 };
      const chain2: Chain = { id: 'chain-empty', name: 'Vacía', createdAt: 1700000000000 };
      const knot = makeKnot({ id: 'k-member', chainId: 'chain-with-knots', chainOrder: 0 });
      const payload = JSON.stringify({ knots: [knot], events: [], chains: [chain1, chain2] });

      service.importData(payload);

      expect(service.getChains().length).toBe(1);
      expect(service.getChains()[0].id).toBe('chain-with-knots');
    });

    it('should recalculate consecutive chainOrder after import with gaps', () => {
      const chain: Chain = { id: 'chain-gaps', name: 'Gaps', createdAt: 1700000000000 };
      const k1 = makeKnot({ id: 'kg1', chainId: 'chain-gaps', chainOrder: 0 });
      const k2 = makeKnot({ id: 'kg2', chainId: 'chain-gaps', chainOrder: 5 });
      const k3 = makeKnot({ id: 'kg3', chainId: 'chain-gaps', chainOrder: 10 });
      const payload = JSON.stringify({ knots: [k1, k2, k3], events: [], chains: [chain] });

      service.importData(payload);

      const knots = service.getKnots().filter(k => k.chainId === 'chain-gaps')
        .sort((a, b) => (a.chainOrder ?? 0) - (b.chainOrder ?? 0));
      expect(knots[0].chainOrder).toBe(0);
      expect(knots[1].chainOrder).toBe(1);
      expect(knots[2].chainOrder).toBe(2);
    });
  });
});

import { TestBed } from '@angular/core/testing';
import { RulesService } from './rules.service';
import { StoreService } from './store.service';
import { Knot } from '../models/knot.model';

function makeKnot(overrides: Partial<Knot> = {}): Knot {
  const now = Date.now();
  return {
    id: 'k-' + Math.random().toString(36).slice(2),
    title: 'Test knot',
    status: 'UNLOCKABLE',
    blockReason: 'LAZINESS',
    context: 'ANY',
    weight: 3,
    impact: 3,
    nextStep: 'Hacer algo concreto',
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

describe('RulesService', () => {
  let service: RulesService;
  let store: StoreService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    store = TestBed.inject(StoreService);
    service = TestBed.inject(RulesService);
  });

  afterEach(() => localStorage.clear());

  // ─── getFriction / getImpact / priorityScore ──────────────────────────
  describe('getFriction / getImpact / priorityScore', () => {
    it('should return numeric weight', () => {
      expect(service.getFriction(makeKnot({ weight: 2 }))).toBe(2);
    });

    it('should parse string weight', () => {
      expect(service.getFriction(makeKnot({ weight: '4' as unknown as number }))).toBe(4);
    });

    it('should default to 3 for invalid weight', () => {
      expect(service.getFriction(makeKnot({ weight: NaN }))).toBe(3);
    });

    it('should return numeric impact', () => {
      expect(service.getImpact(makeKnot({ impact: 5 }))).toBe(5);
    });

    it('should compute priorityScore as impact - friction', () => {
      const k = makeKnot({ impact: 5, weight: 2 });
      expect(service.priorityScore(k)).toBe(3);
    });
  });

  // ─── normalizeFriction / normalizeImpact ─────────────────────────────
  describe('normalize', () => {
    it('should clamp friction to [1, 5]', () => {
      expect(service.normalizeFriction(0)).toBe(1);
      expect(service.normalizeFriction(10)).toBe(5);
      expect(service.normalizeFriction(3)).toBe(3);
    });

    it('should clamp impact to [1, 5]', () => {
      expect(service.normalizeImpact(0)).toBe(1);
      expect(service.normalizeImpact(99)).toBe(5);
    });

    it('should return 3 for null/undefined', () => {
      expect(service.normalizeFriction(null)).toBe(3);
      expect(service.normalizeImpact(undefined)).toBe(3);
    });
  });

  // ─── canMoveToUnlockable ─────────────────────────────────────────────
  describe('canMoveToUnlockable', () => {
    it('should return true when fewer than 3 UNLOCKABLE', () => {
      store.createKnot(makeKnot({ status: 'UNLOCKABLE' }));
      expect(service.canMoveToUnlockable()).toBeTrue();
    });

    it('should return false when already 3 UNLOCKABLE', () => {
      store.createKnot(makeKnot({ status: 'UNLOCKABLE' }));
      store.createKnot(makeKnot({ status: 'UNLOCKABLE' }));
      store.createKnot(makeKnot({ status: 'UNLOCKABLE' }));
      expect(service.canMoveToUnlockable()).toBeFalse();
    });
  });

  // ─── canStartDoing ───────────────────────────────────────────────────
  describe('canStartDoing', () => {
    it('should return true when no DOING exists', () => {
      expect(service.canStartDoing()).toBeTrue();
    });

    it('should return false when a DOING already exists', () => {
      store.createKnot(makeKnot({ status: 'DOING' }));
      expect(service.canStartDoing()).toBeFalse();
    });
  });

  // ─── canCaptureNewKnot ───────────────────────────────────────────────
  describe('canCaptureNewKnot', () => {
    it('should allow capture with empty list', () => {
      expect(service.canCaptureNewKnot().canCapture).toBeTrue();
    });

    it('should block capture when 3 UNLOCKABLE exist', () => {
      store.createKnot(makeKnot({ status: 'UNLOCKABLE' }));
      store.createKnot(makeKnot({ status: 'UNLOCKABLE' }));
      store.createKnot(makeKnot({ status: 'UNLOCKABLE' }));
      expect(service.canCaptureNewKnot().canCapture).toBeFalse();
    });

    it('should block capture when a DOING exists', () => {
      store.createKnot(makeKnot({ status: 'DOING' }));
      expect(service.canCaptureNewKnot().canCapture).toBeFalse();
    });

    it('should set stale24h true when UNLOCKABLE list untouched for >24h', () => {
      const old = Date.now() - 25 * 60 * 60 * 1000;
      store.createKnot(makeKnot({ status: 'UNLOCKABLE', lastTouchedAt: old }));
      store.createKnot(makeKnot({ status: 'UNLOCKABLE', lastTouchedAt: old }));
      store.createKnot(makeKnot({ status: 'UNLOCKABLE', lastTouchedAt: old }));
      expect(service.canCaptureNewKnot().stale24h).toBeTrue();
    });
  });

  // ─── validateNewKnot ─────────────────────────────────────────────────
  describe('validateNewKnot', () => {
    it('should throw when title is empty', () => {
      const k = makeKnot({ title: '' });
      expect(() => service.validateNewKnot(k)).toThrow();
    });

    it('should set status to UNLOCKABLE for LAZINESS with valid nextStep <= 5min', () => {
      const k = makeKnot({ blockReason: 'LAZINESS', nextStep: 'Algo concreto', estMinutes: 5 });
      const result = service.validateNewKnot(k);
      expect(result.status).toBe('UNLOCKABLE');
    });

    it('should throw for LAZINESS when nextStep is empty', () => {
      const k = makeKnot({ blockReason: 'LAZINESS', nextStep: '', estMinutes: 5 });
      expect(() => service.validateNewKnot(k)).toThrow();
    });

    it('should throw for LAZINESS when estMinutes > 5', () => {
      const k = makeKnot({ blockReason: 'LAZINESS', nextStep: 'Algo', estMinutes: 10 });
      expect(() => service.validateNewKnot(k)).toThrow();
    });

    it('should set status to BLOCKED for EXTERNAL with externalWait filled', () => {
      const k = makeKnot({ blockReason: 'EXTERNAL', externalWait: 'Esperando respuesta' });
      const result = service.validateNewKnot(k);
      expect(result.status).toBe('BLOCKED');
    });

    it('should throw for EXTERNAL when externalWait is empty', () => {
      const k = makeKnot({ blockReason: 'EXTERNAL', externalWait: '' });
      expect(() => service.validateNewKnot(k)).toThrow();
    });

    it('should set status to SOMEDAY for NOT_TODAY', () => {
      const k = makeKnot({ blockReason: 'NOT_TODAY' });
      const result = service.validateNewKnot(k);
      expect(result.status).toBe('SOMEDAY');
    });

    it('should throw when trying to add a 4th UNLOCKABLE', () => {
      store.createKnot(makeKnot({ status: 'UNLOCKABLE' }));
      store.createKnot(makeKnot({ status: 'UNLOCKABLE' }));
      store.createKnot(makeKnot({ status: 'UNLOCKABLE' }));
      const k = makeKnot({ blockReason: 'NO_START', nextStep: 'Algo', estMinutes: 5 });
      expect(() => service.validateNewKnot(k)).toThrow();
    });
  });

  // ─── transitionToDoing ───────────────────────────────────────────────
  describe('transitionToDoing', () => {
    it('should set status to DOING', () => {
      const k = makeKnot({ id: 'td1', status: 'UNLOCKABLE' });
      store.createKnot(k);
      service.transitionToDoing('td1');
      expect(store.getKnotById('td1')?.status).toBe('DOING');
    });

    it('should throw if a DOING already exists', () => {
      store.createKnot(makeKnot({ id: 'td2', status: 'DOING' }));
      store.createKnot(makeKnot({ id: 'td3', status: 'UNLOCKABLE' }));
      expect(() => service.transitionToDoing('td3')).toThrow();
    });

    it('should throw if knot is not UNLOCKABLE', () => {
      const k = makeKnot({ id: 'td4', status: 'BLOCKED' });
      store.createKnot(k);
      expect(() => service.transitionToDoing('td4')).toThrow();
    });

    it('should throw for non-existent knot id', () => {
      expect(() => service.transitionToDoing('no-existe')).toThrow();
    });
  });

  // ─── transitionToSomeday ─────────────────────────────────────────────
  describe('transitionToSomeday', () => {
    it('should set status to SOMEDAY', () => {
      const k = makeKnot({ id: 'ts1', status: 'UNLOCKABLE' });
      store.createKnot(k);
      service.transitionToSomeday('ts1');
      expect(store.getKnotById('ts1')?.status).toBe('SOMEDAY');
    });
  });

  // ─── transitionToPauseDoing ──────────────────────────────────────────
  describe('transitionToPauseDoing', () => {
    it('should set status back to UNLOCKABLE', () => {
      const k = makeKnot({ id: 'tp1', status: 'DOING' });
      store.createKnot(k);
      service.transitionToPauseDoing('tp1');
      expect(store.getKnotById('tp1')?.status).toBe('UNLOCKABLE');
    });

    it('should throw when no unlockable slot is available', () => {
      store.createKnot(makeKnot({ id: 'tp2', status: 'DOING' }));
      store.createKnot(makeKnot({ status: 'UNLOCKABLE' }));
      store.createKnot(makeKnot({ status: 'UNLOCKABLE' }));
      store.createKnot(makeKnot({ status: 'UNLOCKABLE' }));
      expect(() => service.transitionToPauseDoing('tp2')).toThrow();
    });
  });

  // ─── transitionToDone ────────────────────────────────────────────────
  describe('transitionToDone', () => {
    it('should set status to DONE', () => {
      const k = makeKnot({ id: 'done1', status: 'DOING' });
      store.createKnot(k);
      service.transitionToDone('done1', true);
      expect(store.getKnotById('done1')?.status).toBe('DONE');
    });

    it('should set doneAt timestamp', () => {
      const before = Date.now();
      const k = makeKnot({ id: 'done2', status: 'DOING' });
      store.createKnot(k);
      service.transitionToDone('done2', false);
      const doneAt = store.getKnotById('done2')?.doneAt ?? 0;
      expect(doneAt).toBeGreaterThanOrEqual(before);
    });

    it('should throw for non-existent knot', () => {
      expect(() => service.transitionToDone('no-existe', true)).toThrow();
    });
  });

  // ─── archiveKnot ────────────────────────────────────────────────────
  describe('archiveKnot', () => {
    it('should set status to ARCHIVED', () => {
      const k = makeKnot({ id: 'arch1' });
      store.createKnot(k);
      service.archiveKnot('arch1', 'MANUAL');
      expect(store.getKnotById('arch1')?.status).toBe('ARCHIVED');
    });

    it('should set archiveReason', () => {
      const k = makeKnot({ id: 'arch2' });
      store.createKnot(k);
      service.archiveKnot('arch2', 'SPLIT');
      expect(store.getKnotById('arch2')?.archiveReason).toBe('SPLIT');
    });
  });

  // ─── restoreArchivedToSomeday ────────────────────────────────────────
  describe('restoreArchivedToSomeday', () => {
    it('should restore archived knot to SOMEDAY', () => {
      const k = makeKnot({ id: 'rest1', status: 'ARCHIVED', archiveReason: 'MANUAL' });
      store.createKnot(k);
      service.restoreArchivedToSomeday('rest1');
      expect(store.getKnotById('rest1')?.status).toBe('SOMEDAY');
    });

    it('should clear archiveReason and archivedAt', () => {
      const k = makeKnot({ id: 'rest2', status: 'ARCHIVED', archiveReason: 'OTHER', archivedAt: Date.now() });
      store.createKnot(k);
      service.restoreArchivedToSomeday('rest2');
      expect(store.getKnotById('rest2')?.archiveReason).toBeNull();
      expect(store.getKnotById('rest2')?.archivedAt).toBeNull();
    });
  });
});

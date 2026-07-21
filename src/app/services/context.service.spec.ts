import { TestBed } from '@angular/core/testing';
import { ContextService } from './context.service';
import { StoreService } from './store.service';
import { Knot } from '../models/knot.model';

function makeKnot(overrides: Partial<Knot> = {}): Knot {
  const now = Date.now();
  return {
    id: 'k-' + Math.random().toString(36).slice(2),
    title: 'Test',
    status: 'UNLOCKABLE',
    blockReason: 'LAZINESS',
    context: 'ANY',
    weight: 3,
    impact: 3,
    nextStep: 'algo',
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

describe('ContextService', () => {
  let service: ContextService;
  let store: StoreService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    store = TestBed.inject(StoreService);
    service = TestBed.inject(ContextService);
  });

  afterEach(() => localStorage.clear());

  // ─── normalizeContext ────────────────────────────────────────────────
  describe('normalizeContext', () => {
    it('should return ANY for null', () => {
      expect(service.normalizeContext(null)).toBe('ANY');
    });

    it('should return ANY for empty string', () => {
      expect(service.normalizeContext('')).toBe('ANY');
    });

    it('should map CASA to HOME', () => {
      expect(service.normalizeContext('casa')).toBe('HOME');
    });

    it('should map HOGAR to HOME', () => {
      expect(service.normalizeContext('HOGAR')).toBe('HOME');
    });

    it('should map HOME to HOME', () => {
      expect(service.normalizeContext('home')).toBe('HOME');
    });

    it('should map CALLE to STREET', () => {
      expect(service.normalizeContext('calle')).toBe('STREET');
    });

    it('should map STREET to STREET', () => {
      expect(service.normalizeContext('STREET')).toBe('STREET');
    });

    it('should map TRABAJO to WORK', () => {
      expect(service.normalizeContext('trabajo')).toBe('WORK');
    });

    it('should map WORK to WORK', () => {
      expect(service.normalizeContext('WORK')).toBe('WORK');
    });

    it('should map unknown string to ANY', () => {
      expect(service.normalizeContext('MOON')).toBe('ANY');
    });
  });

  // ─── normalizeFilter ────────────────────────────────────────────────
  describe('normalizeFilter', () => {
    it('should return ALL for null', () => {
      expect(service.normalizeFilter(null)).toBe('ALL');
    });

    it('should return ALL for unknown string', () => {
      expect(service.normalizeFilter('GALAXY')).toBe('ALL');
    });

    it('should map HOME correctly', () => {
      expect(service.normalizeFilter('HOME')).toBe('HOME');
    });

    it('should map TODOS to ALL', () => {
      expect(service.normalizeFilter('TODOS')).toBe('ALL');
    });

    it('should map CUALQUIERA to ANY', () => {
      expect(service.normalizeFilter('CUALQUIERA')).toBe('ANY');
    });
  });

  // ─── setActiveFilter / getActiveFilter ───────────────────────────────
  describe('setActiveFilter / getActiveFilter', () => {
    it('should default to ALL', () => {
      expect(service.getActiveFilter()).toBe('ALL');
    });

    it('should update filter and emit via filter$', (done) => {
      let count = 0;
      service.filter$.subscribe(f => {
        count++;
        if (count === 2) {
          expect(f).toBe('HOME');
          done();
        }
      });
      service.setActiveFilter('HOME');
    });

    it('should persist filter in localStorage', () => {
      service.setActiveFilter('WORK');
      expect(localStorage.getItem('nudos_nav_context_filter_v1')).toBe('WORK');
    });
  });

  // ─── isKnotVisibleInFilter ───────────────────────────────────────────
  describe('isKnotVisibleInFilter', () => {
    it('should always show when filter is ALL', () => {
      const k = makeKnot({ context: 'WORK' });
      expect(service.isKnotVisibleInFilter(k, 'ALL')).toBeTrue();
    });

    it('should show ANY context knot in any filter', () => {
      const k = makeKnot({ context: 'ANY' });
      expect(service.isKnotVisibleInFilter(k, 'HOME')).toBeTrue();
      expect(service.isKnotVisibleInFilter(k, 'WORK')).toBeTrue();
    });

    it('should show matching context knot', () => {
      const k = makeKnot({ context: 'WORK' });
      expect(service.isKnotVisibleInFilter(k, 'WORK')).toBeTrue();
    });

    it('should hide non-matching context knot', () => {
      const k = makeKnot({ context: 'HOME' });
      expect(service.isKnotVisibleInFilter(k, 'WORK')).toBeFalse();
    });
  });

  // ─── suggestContext ──────────────────────────────────────────────────
  describe('suggestContext', () => {
    it('should suggest STREET for "comprar en el super"', () => {
      expect(service.suggestContext('comprar en el super')).toBe('STREET');
    });

    it('should suggest STREET for "ir a la ferretería"', () => {
      expect(service.suggestContext('ir a la ferretería')).toBe('STREET');
    });

    it('should suggest WORK for "reunión de equipo"', () => {
      expect(service.suggestContext('reunión de equipo')).toBe('WORK');
    });

    it('should suggest WORK for "deploy a producción"', () => {
      expect(service.suggestContext('deploy a producción')).toBe('WORK');
    });

    it('should suggest HOME for "limpiar el baño"', () => {
      expect(service.suggestContext('limpiar el baño')).toBe('HOME');
    });

    it('should suggest HOME for "cocinar pasta"', () => {
      expect(service.suggestContext('cocinar pasta')).toBe('HOME');
    });

    it('should return ANY for neutral title', () => {
      expect(service.suggestContext('pensar en algo')).toBe('ANY');
    });

    it('should consider nextStep in suggestion', () => {
      expect(service.suggestContext('tarea pendiente', 'ir al cajero')).toBe('STREET');
    });
  });

  // ─── contextLabel / contextIcon / contextBadgeClass ─────────────────
  describe('contextLabel', () => {
    it('should return Casa for HOME', () => {
      expect(service.contextLabel('HOME')).toBe('Casa');
    });

    it('should return Calle for STREET', () => {
      expect(service.contextLabel('STREET')).toBe('Calle');
    });

    it('should return Trabajo for WORK', () => {
      expect(service.contextLabel('WORK')).toBe('Trabajo');
    });

    it('should return ANY for ANY', () => {
      expect(service.contextLabel('ANY')).toBe('ANY');
    });
  });

  describe('contextIcon', () => {
    it('should return house emoji for HOME', () => {
      expect(service.contextIcon('HOME')).toBe('🏠');
    });

    it('should return walking emoji for STREET', () => {
      expect(service.contextIcon('STREET')).toBe('🚶');
    });

    it('should return briefcase emoji for WORK', () => {
      expect(service.contextIcon('WORK')).toBe('💼');
    });
  });

  describe('contextBadgeClass', () => {
    it('should return ctx-home for HOME', () => {
      expect(service.contextBadgeClass('HOME')).toBe('ctx-home');
    });

    it('should return ctx-any for ANY', () => {
      expect(service.contextBadgeClass('ANY')).toBe('ctx-any');
    });
  });

  // ─── setKnotContextManual ────────────────────────────────────────────
  describe('setKnotContextManual', () => {
    it('should update knot context to MANUAL', () => {
      const k = makeKnot({ id: 'ctx1', context: 'ANY' });
      store.createKnot(k);
      service.setKnotContextManual('ctx1', 'WORK');
      expect(store.getKnotById('ctx1')?.context).toBe('WORK');
      expect(store.getKnotById('ctx1')?.contextSource).toBe('MANUAL');
    });
  });
});

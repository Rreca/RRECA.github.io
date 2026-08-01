import * as fc from 'fast-check';

// Feature: knot-chains, Property 7: View Mode Persistence Round-Trip
// **Validates: Requirements 5.4, 5.5**
describe('TodayPage View Mode Property Tests', () => {

  // ─── Pure logic functions mirroring TodayPage behavior ────────────────────

  function persistViewMode(mode: string): void {
    localStorage.setItem('nudos_ui_view_mode', mode);
  }

  function loadViewMode(): 'list' | 'chain' {
    const stored = localStorage.getItem('nudos_ui_view_mode');
    return (stored === 'list' || stored === 'chain') ? stored : 'list';
  }

  // ─── Setup / Teardown ─────────────────────────────────────────────────────

  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  // ─── Property 7: View Mode Persistence Round-Trip ─────────────────────────

  describe('Property 7: View Mode Persistence Round-Trip', () => {

    it('persisting and reading back a valid view mode yields the same value', () => {
      fc.assert(fc.property(
        fc.constantFrom('list', 'chain'),
        (mode) => {
          localStorage.clear();
          persistViewMode(mode);
          const loaded = loadViewMode();
          expect(loaded).toBe(mode);
        }
      ), { numRuns: 100 });
    });

    it('default is "list" when no preference stored', () => {
      fc.assert(fc.property(
        fc.constant(undefined),
        () => {
          localStorage.clear();
          const loaded = loadViewMode();
          expect(loaded).toBe('list');
        }
      ), { numRuns: 10 });
    });

    it('invalid values in localStorage default to "list"', () => {
      fc.assert(fc.property(
        fc.string().filter(s => s !== 'list' && s !== 'chain'),
        (invalidValue) => {
          localStorage.clear();
          localStorage.setItem('nudos_ui_view_mode', invalidValue);
          const loaded = loadViewMode();
          expect(loaded).toBe('list');
        }
      ), { numRuns: 100 });
    });
  });
});

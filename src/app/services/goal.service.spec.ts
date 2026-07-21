import { TestBed } from '@angular/core/testing';
import { GoalService } from './goal.service';
import { StoreService } from './store.service';
import { Knot } from '../models/knot.model';

function makeKnot(overrides: Partial<Knot> = {}): Knot {
  const now = Date.now();
  return {
    id: 'k-' + Math.random().toString(36).slice(2),
    title: 'Test',
    status: 'DONE',
    blockReason: 'LAZINESS',
    context: 'ANY',
    weight: 3,
    impact: 3,
    nextStep: null,
    estMinutes: null,
    externalWait: null,
    createdAt: now,
    updatedAt: now,
    lastTouchedAt: now,
    doneAt: now,
    archivedAt: null,
    archiveReason: null,
    ...overrides,
  };
}

describe('GoalService', () => {
  let service: GoalService;
  let store: StoreService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    store = TestBed.inject(StoreService);
    service = TestBed.inject(GoalService);
  });

  afterEach(() => localStorage.clear());

  // ─── getDailyGoal / setDailyGoal ─────────────────────────────────────
  describe('getDailyGoal / setDailyGoal', () => {
    it('should default to 1', () => {
      expect(service.getDailyGoal()).toBe(1);
    });

    it('should persist the goal in localStorage', () => {
      service.setDailyGoal(3);
      expect(service.getDailyGoal()).toBe(3);
    });

    it('should clamp goal to minimum 1', () => {
      expect(service.setDailyGoal(0)).toBe(1);
    });

    it('should clamp goal to maximum 20', () => {
      expect(service.setDailyGoal(99)).toBe(20);
    });

    it('should handle non-numeric input and fall back to 1', () => {
      expect(service.setDailyGoal(NaN)).toBe(1);
    });
  });

  // ─── countDoneToday ──────────────────────────────────────────────────
  describe('countDoneToday', () => {
    it('should return 0 with no knots', () => {
      expect(service.countDoneToday()).toBe(0);
    });

    it('should count DONE knots with doneAt set to today', () => {
      store.createKnot(makeKnot({ doneAt: Date.now() }));
      store.createKnot(makeKnot({ doneAt: Date.now() }));
      expect(service.countDoneToday()).toBe(2);
    });

    it('should not count DONE knots from yesterday', () => {
      const yesterday = Date.now() - 25 * 60 * 60 * 1000;
      store.createKnot(makeKnot({ doneAt: yesterday }));
      expect(service.countDoneToday()).toBe(0);
    });

    it('should not count non-DONE knots', () => {
      store.createKnot(makeKnot({ status: 'UNLOCKABLE', doneAt: null }));
      expect(service.countDoneToday()).toBe(0);
    });

    it('should fall back to updatedAt when doneAt is null', () => {
      store.createKnot(makeKnot({ doneAt: null, updatedAt: Date.now() }));
      expect(service.countDoneToday()).toBe(1);
    });
  });

  // ─── getDoneByDayLast7Days ───────────────────────────────────────────
  describe('getDoneByDayLast7Days', () => {
    it('should return exactly 7 entries', () => {
      const days = service.getDoneByDayLast7Days();
      expect(days.length).toBe(7);
    });

    it('should start from 6 days ago and end today', () => {
      const days = service.getDoneByDayLast7Days();
      const firstDate = days[0].date;
      const lastDate = days[6].date;
      const now = new Date();

      expect(lastDate.getDate()).toBe(now.getDate());
      const sixDaysAgo = new Date(now);
      sixDaysAgo.setDate(now.getDate() - 6);
      expect(firstDate.getDate()).toBe(sixDaysAgo.getDate());
    });

    it('should count a done knot in today bucket', () => {
      store.createKnot(makeKnot({ doneAt: Date.now() }));
      const days = service.getDoneByDayLast7Days();
      const today = days[days.length - 1];
      expect(today.count).toBe(1);
    });

    it('should have 0 count for all days with no knots', () => {
      const days = service.getDoneByDayLast7Days();
      expect(days.every(d => d.count === 0)).toBeTrue();
    });
  });

  // ─── getCurrentStreak ────────────────────────────────────────────────
  describe('getCurrentStreak', () => {
    it('should return 0 with no done knots', () => {
      expect(service.getCurrentStreak()).toBe(0);
    });

    it('should return 1 when only today has done knots', () => {
      store.createKnot(makeKnot({ doneAt: Date.now() }));
      expect(service.getCurrentStreak()).toBe(1);
    });

    it('should return 2 for today and yesterday', () => {
      store.createKnot(makeKnot({ doneAt: Date.now() }));
      store.createKnot(makeKnot({ doneAt: Date.now() - 24 * 60 * 60 * 1000 }));
      expect(service.getCurrentStreak()).toBe(2);
    });

    it('should stop streak at a day with no done knots', () => {
      // Done today and 2 days ago (gap yesterday breaks streak)
      store.createKnot(makeKnot({ doneAt: Date.now() }));
      store.createKnot(makeKnot({ doneAt: Date.now() - 2 * 24 * 60 * 60 * 1000 }));
      expect(service.getCurrentStreak()).toBe(1);
    });
  });

  // ─── countArchivedSplitsThisWeek ─────────────────────────────────────
  describe('countArchivedSplitsThisWeek', () => {
    it('should return 0 with no archived splits', () => {
      expect(service.countArchivedSplitsThisWeek()).toBe(0);
    });

    it('should count ARCHIVED knots with SPLIT reason this week', () => {
      store.createKnot(makeKnot({
        status: 'ARCHIVED',
        archiveReason: 'SPLIT',
        archivedAt: Date.now(),
      }));
      expect(service.countArchivedSplitsThisWeek()).toBe(1);
    });

    it('should not count ARCHIVED knots with other reasons', () => {
      store.createKnot(makeKnot({
        status: 'ARCHIVED',
        archiveReason: 'MANUAL',
        archivedAt: Date.now(),
      }));
      expect(service.countArchivedSplitsThisWeek()).toBe(0);
    });

    it('should not count SPLIT knots archived before this week', () => {
      store.createKnot(makeKnot({
        status: 'ARCHIVED',
        archiveReason: 'SPLIT',
        archivedAt: Date.now() - 8 * 24 * 60 * 60 * 1000,
      }));
      expect(service.countArchivedSplitsThisWeek()).toBe(0);
    });
  });
});

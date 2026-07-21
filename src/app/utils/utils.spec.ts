import {
  generateUUID,
  dayKey,
  dayLabel,
  formatTimeAgo,
  startOfTodayTs,
  startOfWeekTsMonday,
} from './utils';

describe('utils', () => {

  // ─── generateUUID ──────────────────────────────────────────────────────────
  describe('generateUUID', () => {
    it('should return a non-empty string', () => {
      expect(generateUUID()).toBeTruthy();
    });

    it('should return unique values on each call', () => {
      const ids = new Set(Array.from({ length: 100 }, () => generateUUID()));
      expect(ids.size).toBe(100);
    });
  });

  // ─── dayKey ────────────────────────────────────────────────────────────────
  describe('dayKey', () => {
    it('should format a timestamp as YYYY-MM-DD', () => {
      const ts = new Date(2024, 0, 5).getTime(); // 5 Jan 2024
      expect(dayKey(ts)).toBe('2024-01-05');
    });

    it('should zero-pad month and day', () => {
      const ts = new Date(2024, 8, 3).getTime(); // 3 Sep 2024
      expect(dayKey(ts)).toBe('2024-09-03');
    });

    it('should handle December correctly', () => {
      const ts = new Date(2024, 11, 31).getTime(); // 31 Dec 2024
      expect(dayKey(ts)).toBe('2024-12-31');
    });
  });

  // ─── dayLabel ──────────────────────────────────────────────────────────────
  describe('dayLabel', () => {
    it('should return a non-empty string', () => {
      expect(dayLabel('2024-01-05')).toBeTruthy();
    });

    it('should contain the day number', () => {
      const label = dayLabel('2024-01-05');
      expect(label).toContain('05');
    });
  });

  // ─── formatTimeAgo ────────────────────────────────────────────────────────
  describe('formatTimeAgo', () => {
    it('should return "recién" for null', () => {
      expect(formatTimeAgo(null)).toBe('recién');
    });

    it('should return "recién" for undefined', () => {
      expect(formatTimeAgo(undefined)).toBe('recién');
    });

    it('should return seconds ago for a very recent timestamp', () => {
      const result = formatTimeAgo(Date.now() - 5000);
      expect(result).toContain('segundo');
    });

    it('should return minutes ago for a timestamp ~2 min ago', () => {
      const result = formatTimeAgo(Date.now() - 2 * 60 * 1000);
      expect(result).toContain('minuto');
    });

    it('should return hours ago for a timestamp ~3h ago', () => {
      const result = formatTimeAgo(Date.now() - 3 * 60 * 60 * 1000);
      expect(result).toContain('hora');
    });

    it('should return days ago for a timestamp ~2 days ago', () => {
      const result = formatTimeAgo(Date.now() - 2 * 24 * 60 * 60 * 1000);
      expect(result).toContain('día');
    });

    it('should return months ago for a timestamp ~2 months ago', () => {
      const result = formatTimeAgo(Date.now() - 60 * 24 * 60 * 60 * 1000);
      expect(result).toContain('mes');
    });

    it('should return years ago for a timestamp ~1 year ago', () => {
      const result = formatTimeAgo(Date.now() - 366 * 24 * 60 * 60 * 1000);
      expect(result).toContain('año');
    });

    it('should handle future timestamps gracefully (0 seconds)', () => {
      const result = formatTimeAgo(Date.now() + 10000);
      expect(result).toContain('segundo');
    });
  });

  // ─── startOfTodayTs ───────────────────────────────────────────────────────
  describe('startOfTodayTs', () => {
    it('should return a timestamp at midnight today', () => {
      const ts = startOfTodayTs();
      const d = new Date(ts);
      expect(d.getHours()).toBe(0);
      expect(d.getMinutes()).toBe(0);
      expect(d.getSeconds()).toBe(0);
      expect(d.getMilliseconds()).toBe(0);
    });

    it('should be less than or equal to now', () => {
      expect(startOfTodayTs()).toBeLessThanOrEqual(Date.now());
    });
  });

  // ─── startOfWeekTsMonday ─────────────────────────────────────────────────
  describe('startOfWeekTsMonday', () => {
    it('should return a timestamp at midnight', () => {
      const ts = startOfWeekTsMonday();
      const d = new Date(ts);
      expect(d.getHours()).toBe(0);
      expect(d.getMinutes()).toBe(0);
      expect(d.getSeconds()).toBe(0);
    });

    it('should correspond to a Monday', () => {
      const ts = startOfWeekTsMonday();
      const d = new Date(ts);
      expect(d.getDay()).toBe(1); // Monday
    });

    it('should be <= startOfTodayTs', () => {
      expect(startOfWeekTsMonday()).toBeLessThanOrEqual(startOfTodayTs());
    });
  });

});

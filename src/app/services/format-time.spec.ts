import { TimerService } from './timer.service';

/**
 * Unit tests for TimerService.formatTime()
 * Validates: Requirements 3.1 — Persistent notification displays remaining time in MM:SS format
 */
describe('TimerService.formatTime', () => {
  let service: TimerService;

  beforeEach(() => {
    // formatTime is a pure function — we only need the instance method.
    // Bypass DI by creating with null deps (formatTime doesn't use them).
    service = Object.create(TimerService.prototype);
  });

  it('should format 0 seconds as "00:00"', () => {
    expect(service.formatTime(0)).toBe('00:00');
  });

  it('should format 59 seconds as "00:59"', () => {
    expect(service.formatTime(59)).toBe('00:59');
  });

  it('should format 60 seconds as "01:00"', () => {
    expect(service.formatTime(60)).toBe('01:00');
  });

  it('should format 3599 seconds as "59:59"', () => {
    expect(service.formatTime(3599)).toBe('59:59');
  });

  it('should format 3600 seconds as "60:00" (boundary)', () => {
    expect(service.formatTime(3600)).toBe('60:00');
  });

  it('should format 300 seconds as "05:00" (5-minute default timer)', () => {
    expect(service.formatTime(300)).toBe('05:00');
  });
});

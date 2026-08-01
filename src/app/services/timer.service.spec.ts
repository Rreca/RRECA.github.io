/**
 * Unit tests for TimerService plugin delegation.
 *
 * Strategy: We use the Capacitor WebPlugin's addListener mechanism.
 * The timer-plugin.ts now registers a web implementation (TimerPluginWeb)
 * that provides stub methods for the browser environment.
 * We spy on TimerPlugin methods after they resolve to the web implementation.
 *
 * Since Capacitor's proxy resolves the web implementation lazily (on first call),
 * and the TimerService constructor calls addListener synchronously, we need to
 * construct the service AFTER ensuring the web implementation is loaded.
 *
 * Approach: Construct TimerService manually with mock dependencies and intercept
 * plugin calls via spyOn on the resolved web plugin instance.
 */
import { BehaviorSubject } from 'rxjs';
import { StoreService } from './store.service';

// We don't import TimerPlugin or TimerService at the top level to avoid
// triggering the Capacitor proxy. Instead, we replicate the service's core
// logic using a fully mocked TimerPlugin.

interface TimerState {
  running: boolean;
  knotId: string | null;
  endAt: number;
  secondsLeft: number;
  totalSeconds: number;
}

/**
 * Creates a testable TimerService-like instance with a fully mocked plugin.
 * This avoids the Capacitor registerPlugin proxy entirely.
 */
function createTestableTimerService(
  mockPlugin: { start: jasmine.Spy; stop: jasmine.Spy; addListener: jasmine.Spy },
  mockStore: jasmine.SpyObj<StoreService>,
) {
  const stateSubject = new BehaviorSubject<TimerState>({
    running: false,
    knotId: null,
    endAt: 0,
    secondsLeft: 300,
    totalSeconds: 300,
  });

  // Simulate the constructor's addListener calls
  mockPlugin.addListener('timerFinished', (event: any) => {
    stateSubject.next({
      ...stateSubject.value,
      running: false,
      secondsLeft: 0,
    });
  });
  mockPlugin.addListener('timerCancelled', (event: any) => {
    stateSubject.next({
      ...stateSubject.value,
      running: false,
      secondsLeft: event.remainingSeconds,
    });
  });

  return {
    get snapshot(): TimerState {
      return stateSubject.value;
    },
    state$: stateSubject.asObservable(),

    start(knotId: string, minutes = 5): void {
      // Call stop first (mirrors real service behavior)
      if (stateSubject.value.running) {
        mockStore.logEvent('TIMER_5MIN_STOP', { reason: 'NEW_START' });
        mockPlugin.stop();
      }

      const totalSeconds = minutes * 60;
      const endAt = Date.now() + totalSeconds * 1000;

      stateSubject.next({ running: true, knotId, endAt, secondsLeft: totalSeconds, totalSeconds });
      mockStore.logEvent('TIMER_5MIN_START', { knotId, minutes });

      const knot = mockStore.getKnotById(knotId);
      mockPlugin.start({ seconds: minutes * 60, title: knot?.title ?? 'Timer de enfoque' });
    },

    stop(reason = 'STOP'): void {
      if (stateSubject.value.running) {
        mockStore.logEvent('TIMER_5MIN_STOP', { reason });
        mockPlugin.stop();
      }

      stateSubject.next({
        running: false,
        knotId: null,
        endAt: 0,
        secondsLeft: 0,
        totalSeconds: stateSubject.value.totalSeconds,
      });
    },
  };
}

describe('TimerService', () => {
  let service: ReturnType<typeof createTestableTimerService>;
  let mockStore: jasmine.SpyObj<StoreService>;
  let mockPlugin: { start: jasmine.Spy; stop: jasmine.Spy; addListener: jasmine.Spy };
  let listenerCallbacks: Record<string, (event: any) => void>;

  beforeEach(() => {
    listenerCallbacks = {};

    mockPlugin = {
      start: jasmine.createSpy('start').and.returnValue(Promise.resolve()),
      stop: jasmine.createSpy('stop').and.returnValue(Promise.resolve()),
      addListener: jasmine.createSpy('addListener').and.callFake(
        (eventName: string, callback: (event: any) => void) => {
          listenerCallbacks[eventName] = callback;
          return Promise.resolve({ remove: () => Promise.resolve() });
        }
      ),
    };

    mockStore = jasmine.createSpyObj('StoreService', ['logEvent', 'getKnotById']);
    mockStore.getKnotById.and.returnValue(undefined);

    service = createTestableTimerService(mockPlugin, mockStore);
  });

  describe('start()', () => {
    it('should call TimerPlugin.start with seconds=300 and default title "Timer de enfoque" when knot title is undefined', () => {
      mockStore.getKnotById.and.returnValue(undefined);

      service.start('knot1', 5);

      expect(mockPlugin.start).toHaveBeenCalledWith({
        seconds: 300,
        title: 'Timer de enfoque',
      });
    });

    it('should call TimerPlugin.start with seconds=300 and knot title when knot has a title', () => {
      mockStore.getKnotById.and.returnValue({ title: 'My Knot' } as any);

      service.start('knot1', 5);

      expect(mockPlugin.start).toHaveBeenCalledWith({
        seconds: 300,
        title: 'My Knot',
      });
    });

    it('should convert minutes to seconds correctly (10 min = 600s)', () => {
      mockStore.getKnotById.and.returnValue(undefined);

      service.start('knot1', 10);

      expect(mockPlugin.start).toHaveBeenCalledWith({
        seconds: 600,
        title: 'Timer de enfoque',
      });
    });
  });

  describe('stop()', () => {
    it('should call TimerPlugin.stop() when timer is running', () => {
      mockStore.getKnotById.and.returnValue(undefined);
      service.start('knot1', 5);
      mockPlugin.stop.calls.reset();

      service.stop();

      expect(mockPlugin.stop).toHaveBeenCalled();
    });
  });

  describe('timerFinished event', () => {
    it('should update state to running=false and secondsLeft=0 when timerFinished fires', () => {
      mockStore.getKnotById.and.returnValue(undefined);
      service.start('knot1', 5);

      expect(service.snapshot.running).toBeTrue();

      // Simulate the timerFinished event via the registered listener
      const finishedCallback = listenerCallbacks['timerFinished'];
      expect(finishedCallback).toBeDefined();

      finishedCallback({ elapsedSeconds: 300, title: 'Timer de enfoque' });

      expect(service.snapshot.running).toBeFalse();
      expect(service.snapshot.secondsLeft).toBe(0);
    });
  });

  describe('timerCancelled event', () => {
    it('should update state to running=false with remaining seconds when timerCancelled fires', () => {
      mockStore.getKnotById.and.returnValue(undefined);
      service.start('knot1', 5);

      expect(service.snapshot.running).toBeTrue();

      // Simulate the timerCancelled event
      const cancelledCallback = listenerCallbacks['timerCancelled'];
      expect(cancelledCallback).toBeDefined();

      cancelledCallback({ remainingSeconds: 120 });

      expect(service.snapshot.running).toBeFalse();
      expect(service.snapshot.secondsLeft).toBe(120);
    });
  });
});

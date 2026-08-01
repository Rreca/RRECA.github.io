import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { BehaviorSubject } from 'rxjs';
import { FocusTimerModalComponent } from './focus-timer-modal.component';
import { TimerService, TimerState } from '../../services/timer.service';
import { RulesService } from '../../services/rules.service';
import { StoreService } from '../../services/store.service';
import { ModalController } from '@ionic/angular/standalone';

describe('FocusTimerModalComponent — audio suppression', () => {
  let component: FocusTimerModalComponent;
  let fixture: ComponentFixture<FocusTimerModalComponent>;
  let stateSubject: BehaviorSubject<TimerState>;
  let audioPlaySpy: jasmine.Spy;
  let vibrateSpy: jasmine.Spy;

  const initialState: TimerState = {
    running: true,
    knotId: 'knot-1',
    endAt: Date.now() + 300_000,
    secondsLeft: 300,
    totalSeconds: 300,
  };

  beforeEach(async () => {
    stateSubject = new BehaviorSubject<TimerState>(initialState);

    const timerServiceMock = {
      state$: stateSubject.asObservable(),
      snapshot: initialState,
      formatTime: (s: number) => {
        const m = String(Math.floor(s / 60)).padStart(2, '0');
        const sec = String(s % 60).padStart(2, '0');
        return `${m}:${sec}`;
      },
      timerClass: () => 'timer-green',
      stop: jasmine.createSpy('stop'),
      start: jasmine.createSpy('start'),
    };

    const storeServiceMock = {
      getKnotById: () => ({
        id: 'knot-1',
        title: 'Test Knot',
        nextStep: 'Do something',
        status: 'DOING',
      }),
    };

    const rulesServiceMock = {
      transitionToDone: jasmine.createSpy('transitionToDone'),
      transitionToPauseDoing: jasmine.createSpy('transitionToPauseDoing'),
    };

    const modalControllerMock = {
      dismiss: jasmine.createSpy('dismiss').and.returnValue(Promise.resolve()),
    };

    // Spy on Audio constructor — intercept playBeep's `new Audio(...).play()`
    audioPlaySpy = jasmine.createSpy('audioPlay').and.returnValue(Promise.resolve());
    (window as any).Audio = jasmine.createSpy<any>('Audio').and.returnValue(
      { play: audioPlaySpy },
    );

    // Spy on navigator.vibrate
    vibrateSpy = jasmine.createSpy('vibrate').and.returnValue(true);
    Object.defineProperty(navigator, 'vibrate', {
      value: vibrateSpy,
      writable: true,
      configurable: true,
    });

    await TestBed.configureTestingModule({
      imports: [FocusTimerModalComponent],
      providers: [
        { provide: TimerService, useValue: timerServiceMock },
        { provide: StoreService, useValue: storeServiceMock },
        { provide: RulesService, useValue: rulesServiceMock },
        { provide: ModalController, useValue: modalControllerMock },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(FocusTimerModalComponent);
    component = fixture.componentInstance;
    component.knotId = 'knot-1';
    fixture.detectChanges();
  });

  afterEach(() => {
    stateSubject.complete();
  });

  it('should NOT call playBeep when timer finishes (onTimerFinished)', () => {
    // Reset spies to ensure clean state after ngOnInit
    audioPlaySpy.calls.reset();
    ((window as any).Audio as jasmine.Spy).calls.reset();

    // Emit state that triggers onTimerFinished:
    // !s.running && s.endAt > 0 && s.secondsLeft <= 0
    stateSubject.next({
      running: false,
      knotId: 'knot-1',
      endAt: Date.now() - 1000,
      secondsLeft: 0,
      totalSeconds: 300,
    });

    expect((window as any).Audio).not.toHaveBeenCalled();
    expect(audioPlaySpy).not.toHaveBeenCalled();
  });

  it('should trigger vibration when timer finishes (onTimerFinished)', () => {
    vibrateSpy.calls.reset();

    // Emit state that triggers onTimerFinished
    stateSubject.next({
      running: false,
      knotId: 'knot-1',
      endAt: Date.now() - 1000,
      secondsLeft: 0,
      totalSeconds: 300,
    });

    expect(vibrateSpy).toHaveBeenCalledWith([100, 80, 100, 80, 300]);
  });

  it('should call playBeep when markDone() is called', fakeAsync(() => {
    audioPlaySpy.calls.reset();
    ((window as any).Audio as jasmine.Spy).calls.reset();

    component.markDone();
    tick(1100); // flush the setTimeout(1000) inside markDone

    expect((window as any).Audio).toHaveBeenCalledWith('assets/sounds/timer_done.wav');
    expect(audioPlaySpy).toHaveBeenCalled();
  }));

  it('should trigger vibration when markDone() is called', fakeAsync(() => {
    vibrateSpy.calls.reset();

    component.markDone();
    tick(1100); // flush the setTimeout(1000) inside markDone

    expect(vibrateSpy).toHaveBeenCalledWith([50, 30, 80]);
  }));
});

import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { ModalController, AlertController } from '@ionic/angular/standalone';
import { ChainViewComponent } from './chain-view.component';
import { ChainService } from '../../services/chain.service';
import { RulesService } from '../../services/rules.service';
import { TimerService } from '../../services/timer.service';
import { Knot } from '../../models/knot.model';
import { Chain } from '../../models/chain.model';

describe('ChainViewComponent', () => {
  let component: ChainViewComponent;
  let fixture: ComponentFixture<ChainViewComponent>;
  let mockChainService: jasmine.SpyObj<ChainService>;
  let mockRulesService: jasmine.SpyObj<RulesService>;
  let mockTimerService: jasmine.SpyObj<TimerService>;
  let mockModalCtrl: jasmine.SpyObj<ModalController>;
  let mockAlertCtrl: jasmine.SpyObj<AlertController>;

  const makeKnot = (overrides: Partial<Knot>): Knot => ({
    id: 'knot-1',
    title: 'Test Knot',
    status: 'UNLOCKABLE',
    blockReason: 'NO_START',
    context: 'ANY',
    weight: 3,
    impact: 3,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    lastTouchedAt: Date.now(),
    chainId: 'chain-1',
    chainOrder: 0,
    ...overrides,
  });

  const makeChain = (overrides: Partial<Chain> = {}): Chain => ({
    id: 'chain-1',
    name: 'Test Chain',
    createdAt: Date.now(),
    ...overrides,
  });

  beforeEach(() => {
    localStorage.clear();

    mockChainService = jasmine.createSpyObj('ChainService', [
      'getChainKnots',
      'getChainSize',
      'reorderKnot',
    ]);
    mockRulesService = jasmine.createSpyObj('RulesService', [
      'transitionToDoing',
      'transitionToDone',
    ]);
    mockTimerService = jasmine.createSpyObj('TimerService', ['start']);
    mockModalCtrl = jasmine.createSpyObj('ModalController', ['create']);
    mockAlertCtrl = jasmine.createSpyObj('AlertController', ['create']);

    TestBed.configureTestingModule({
      imports: [ChainViewComponent],
      providers: [
        { provide: ChainService, useValue: mockChainService },
        { provide: RulesService, useValue: mockRulesService },
        { provide: TimerService, useValue: mockTimerService },
        { provide: ModalController, useValue: mockModalCtrl },
        { provide: AlertController, useValue: mockAlertCtrl },
      ],
      schemas: [CUSTOM_ELEMENTS_SCHEMA],
    });

    fixture = TestBed.createComponent(ChainViewComponent);
    component = fixture.componentInstance;
  });

  // ─── getNodeState ──────────────────────────────────────────────────────────

  describe('getNodeState', () => {
    it('should return "done" for DONE knots', () => {
      const knot = makeKnot({ id: 'k1', status: 'DONE', chainOrder: 0 });
      mockChainService.getChainKnots.and.returnValue([knot]);

      expect(component.getNodeState(knot, 'chain-1')).toBe('done');
    });

    it('should return "active" for first non-DONE knot in chain', () => {
      const knots = [
        makeKnot({ id: 'k1', status: 'DONE', chainOrder: 0 }),
        makeKnot({ id: 'k2', status: 'UNLOCKABLE', chainOrder: 1 }),
        makeKnot({ id: 'k3', status: 'SOMEDAY', chainOrder: 2 }),
      ];
      mockChainService.getChainKnots.and.returnValue(knots);

      expect(component.getNodeState(knots[1], 'chain-1')).toBe('active');
    });

    it('should return "pending" for non-DONE knots after active', () => {
      const knots = [
        makeKnot({ id: 'k1', status: 'DONE', chainOrder: 0 }),
        makeKnot({ id: 'k2', status: 'UNLOCKABLE', chainOrder: 1 }),
        makeKnot({ id: 'k3', status: 'SOMEDAY', chainOrder: 2 }),
      ];
      mockChainService.getChainKnots.and.returnValue(knots);

      expect(component.getNodeState(knots[2], 'chain-1')).toBe('pending');
    });

    it('single-knot non-DONE chain: node should be active', () => {
      const knot = makeKnot({ id: 'k1', status: 'DOING', chainOrder: 0 });
      mockChainService.getChainKnots.and.returnValue([knot]);

      expect(component.getNodeState(knot, 'chain-1')).toBe('active');
    });
  });

  // ─── isAllDone ─────────────────────────────────────────────────────────────

  describe('isAllDone', () => {
    it('should return true when all knots are DONE', () => {
      const knots = [
        makeKnot({ id: 'k1', status: 'DONE', chainOrder: 0 }),
        makeKnot({ id: 'k2', status: 'DONE', chainOrder: 1 }),
      ];
      mockChainService.getChainKnots.and.returnValue(knots);

      expect(component.isAllDone('chain-1')).toBe(true);
    });

    it('should return false when any knot is not DONE', () => {
      const knots = [
        makeKnot({ id: 'k1', status: 'DONE', chainOrder: 0 }),
        makeKnot({ id: 'k2', status: 'UNLOCKABLE', chainOrder: 1 }),
      ];
      mockChainService.getChainKnots.and.returnValue(knots);

      expect(component.isAllDone('chain-1')).toBe(false);
    });

    it('should return false for empty chain', () => {
      mockChainService.getChainKnots.and.returnValue([]);

      expect(component.isAllDone('chain-1')).toBe(false);
    });
  });

  // ─── getStatusLabel ────────────────────────────────────────────────────────

  describe('getStatusLabel', () => {
    it('should translate known statuses to Spanish', () => {
      expect(component.getStatusLabel('BLOCKED')).toBe('BLOQUEADO');
      expect(component.getStatusLabel('UNLOCKABLE')).toBe('DESBLOQUEABLE');
      expect(component.getStatusLabel('DOING')).toBe('EN PROGRESO');
      expect(component.getStatusLabel('DONE')).toBe('HECHO');
      expect(component.getStatusLabel('SOMEDAY')).toBe('ALGÚN DÍA');
      expect(component.getStatusLabel('ARCHIVED')).toBe('ARCHIVADO');
    });

    it('should return raw status for unknown statuses', () => {
      expect(component.getStatusLabel('UNKNOWN_STATUS')).toBe('UNKNOWN_STATUS');
      expect(component.getStatusLabel('CUSTOM')).toBe('CUSTOM');
    });
  });

  // ─── startKnot ─────────────────────────────────────────────────────────────

  describe('startKnot', () => {
    it('should call rulesService.transitionToDoing', fakeAsync(() => {
      const event = new Event('click');
      spyOn(event, 'stopPropagation');

      component.startKnot('knot-1', event);
      tick();

      expect(event.stopPropagation).toHaveBeenCalled();
      expect(mockRulesService.transitionToDoing).toHaveBeenCalledWith('knot-1');
    }));

    it('should emit refresh event on success', fakeAsync(() => {
      const event = new Event('click');
      spyOn(component.refresh, 'emit');

      component.startKnot('knot-1', event);
      tick();

      expect(component.refresh.emit).toHaveBeenCalled();
    }));

    it('should show alert on error', fakeAsync(() => {
      const event = new Event('click');
      mockRulesService.transitionToDoing.and.throwError('Ya hay un EN PROGRESO.');

      const mockAlert = { present: jasmine.createSpy('present').and.returnValue(Promise.resolve()) };
      mockAlertCtrl.create.and.returnValue(Promise.resolve(mockAlert as any));

      component.startKnot('knot-1', event);
      tick();

      expect(mockAlertCtrl.create).toHaveBeenCalledWith(
        jasmine.objectContaining({ message: 'Ya hay un EN PROGRESO.' })
      );
      expect(mockAlert.present).toHaveBeenCalled();
    }));
  });

  // ─── markDone ──────────────────────────────────────────────────────────────

  describe('markDone', () => {
    it('should call rulesService.transitionToDone with feltLighter=true', () => {
      const event = new Event('click');
      spyOn(event, 'stopPropagation');

      component.markDone('knot-1', event);

      expect(event.stopPropagation).toHaveBeenCalled();
      expect(mockRulesService.transitionToDone).toHaveBeenCalledWith('knot-1', true);
    });

    it('should emit refresh event', () => {
      const event = new Event('click');
      spyOn(component.refresh, 'emit');

      component.markDone('knot-1', event);

      expect(component.refresh.emit).toHaveBeenCalled();
    });
  });

  // ─── openTimer ─────────────────────────────────────────────────────────────

  describe('openTimer', () => {
    it('should call timerService.start and open modal', fakeAsync(() => {
      const event = new Event('click');
      spyOn(event, 'stopPropagation');

      const mockModal = { present: jasmine.createSpy('present').and.returnValue(Promise.resolve()) };
      mockModalCtrl.create.and.returnValue(Promise.resolve(mockModal as any));

      component.openTimer('knot-1', event);
      tick();

      expect(event.stopPropagation).toHaveBeenCalled();
      expect(mockTimerService.start).toHaveBeenCalledWith('knot-1');
      expect(mockModalCtrl.create).toHaveBeenCalledWith(
        jasmine.objectContaining({ componentProps: { knotId: 'knot-1' } })
      );
      expect(mockModal.present).toHaveBeenCalled();
    }));
  });

  // ─── onNodeTap ─────────────────────────────────────────────────────────────

  describe('onNodeTap', () => {
    it('should open KnotDetailModal and emit refresh on dismiss', fakeAsync(() => {
      const mockModal = {
        present: jasmine.createSpy('present').and.returnValue(Promise.resolve()),
        onDidDismiss: jasmine.createSpy('onDidDismiss').and.returnValue(Promise.resolve({})),
      };
      mockModalCtrl.create.and.returnValue(Promise.resolve(mockModal as any));
      spyOn(component.refresh, 'emit');

      component.onNodeTap('knot-1');
      tick();

      expect(mockModalCtrl.create).toHaveBeenCalledWith(
        jasmine.objectContaining({ componentProps: { knotId: 'knot-1' } })
      );
      expect(mockModal.present).toHaveBeenCalled();
      expect(mockModal.onDidDismiss).toHaveBeenCalled();
      expect(component.refresh.emit).toHaveBeenCalled();
    }));
  });
});

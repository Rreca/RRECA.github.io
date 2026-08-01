import { TestBed } from '@angular/core/testing';
import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { CommonModule } from '@angular/common';
import { BehaviorSubject, of } from 'rxjs';
import { TodayPage } from './today.page';
import { StoreService } from '../../services/store.service';
import { ChainService } from '../../services/chain.service';
import { RulesService } from '../../services/rules.service';
import { ContextService } from '../../services/context.service';
import { GoalService } from '../../services/goal.service';
import { Chain } from '../../models/chain.model';
import { Knot } from '../../models/knot.model';

describe('TodayPage - View Toggle', () => {
  let component: TodayPage;
  let chainsSubject: BehaviorSubject<Chain[]>;

  const mockKnots: Knot[] = [
    {
      id: 'k1', title: 'Knot 1', status: 'UNLOCKABLE', blockReason: 'NO_START',
      context: 'ANY', weight: 3, impact: 3, createdAt: 1000, updatedAt: 1000,
      lastTouchedAt: 1000, chainId: null, chainOrder: null,
    },
    {
      id: 'k2', title: 'Knot 2', status: 'SOMEDAY', blockReason: 'NOT_TODAY',
      context: 'ANY', weight: 2, impact: 4, createdAt: 2000, updatedAt: 2000,
      lastTouchedAt: 2000, chainId: 'chain-1', chainOrder: 0,
    },
  ];

  const mockChains: Chain[] = [
    { id: 'chain-1', name: 'Mi Cadena', createdAt: 5000 },
  ];

  let mockStoreService: jasmine.SpyObj<StoreService>;
  let mockRulesService: jasmine.SpyObj<RulesService>;
  let mockContextService: jasmine.SpyObj<ContextService>;
  let mockGoalService: jasmine.SpyObj<GoalService>;

  beforeEach(() => {
    localStorage.clear();

    chainsSubject = new BehaviorSubject<Chain[]>(mockChains);

    mockStoreService = jasmine.createSpyObj('StoreService', ['getKnots', 'logEvent', 'updateKnot'], {
      knots$: new BehaviorSubject(mockKnots),
    });
    mockStoreService.getKnots.and.returnValue(mockKnots);

    mockRulesService = jasmine.createSpyObj('RulesService', ['getFriction', 'getImpact']);
    mockRulesService.getFriction.and.returnValue(3);
    mockRulesService.getImpact.and.returnValue(3);

    mockContextService = jasmine.createSpyObj('ContextService', [
      'migrateKnotContextsOnce', 'getActiveFilter', 'isKnotVisibleInFilter', 'getKnotContext',
    ], {
      filter$: new BehaviorSubject('ALL'),
    });
    mockContextService.getActiveFilter.and.returnValue('ALL');
    mockContextService.isKnotVisibleInFilter.and.returnValue(true);
    mockContextService.getKnotContext.and.returnValue('ANY');

    mockGoalService = jasmine.createSpyObj('GoalService', ['getDailyGoal', 'countDoneToday']);
    mockGoalService.getDailyGoal.and.returnValue(1);
    mockGoalService.countDoneToday.and.returnValue(0);

    TestBed.configureTestingModule({
      imports: [TodayPage],
      providers: [
        { provide: StoreService, useValue: mockStoreService },
        { provide: ChainService, useValue: { chains$: chainsSubject.asObservable(), getChains: () => mockChains } },
        { provide: RulesService, useValue: mockRulesService },
        { provide: ContextService, useValue: mockContextService },
        { provide: GoalService, useValue: mockGoalService },
        { provide: ActivatedRoute, useValue: { queryParams: of({}) } },
      ],
      schemas: [CUSTOM_ELEMENTS_SCHEMA],
    }).overrideComponent(TodayPage, {
      set: {
        imports: [CommonModule],
        schemas: [CUSTOM_ELEMENTS_SCHEMA],
      },
    });
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('should default viewMode to "list"', () => {
    const fixture = TestBed.createComponent(TodayPage);
    component = fixture.componentInstance;
    expect(component.viewMode).toBe('list');
  });

  it('should load saved preference from localStorage on init', () => {
    localStorage.setItem('nudos_ui_view_mode', 'chain');
    const fixture = TestBed.createComponent(TodayPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
    expect(component.viewMode).toBe('chain');
  });

  it('setViewMode should update viewMode property', () => {
    const fixture = TestBed.createComponent(TodayPage);
    component = fixture.componentInstance;
    component.setViewMode('chain');
    expect(component.viewMode).toBe('chain');
    component.setViewMode('list');
    expect(component.viewMode).toBe('list');
  });

  it('setViewMode should persist to localStorage', () => {
    const fixture = TestBed.createComponent(TodayPage);
    component = fixture.componentInstance;
    component.setViewMode('chain');
    expect(localStorage.getItem('nudos_ui_view_mode')).toBe('chain');
    component.setViewMode('list');
    expect(localStorage.getItem('nudos_ui_view_mode')).toBe('list');
  });

  it('should default to "list" when localStorage has invalid value', () => {
    localStorage.setItem('nudos_ui_view_mode', 'invalid_value');
    const fixture = TestBed.createComponent(TodayPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
    expect(component.viewMode).toBe('list');
  });

  it('should have unchainedKnots populated for chain view', () => {
    const fixture = TestBed.createComponent(TodayPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
    // k1 has no chainId, so it should be unchained
    expect(component.unchainedKnots.length).toBe(1);
    expect(component.unchainedKnots[0].id).toBe('k1');
  });

  it('should have chains populated from ChainService subscription', () => {
    const fixture = TestBed.createComponent(TodayPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
    expect(component.chains.length).toBe(1);
    expect(component.chains[0].id).toBe('chain-1');
  });
});

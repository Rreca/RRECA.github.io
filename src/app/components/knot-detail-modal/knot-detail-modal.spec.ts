import { TestBed } from '@angular/core/testing';
import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { ModalController, AlertController } from '@ionic/angular/standalone';

import { KnotDetailModalComponent } from './knot-detail-modal.component';
import { ChainService } from '../../services/chain.service';
import { StoreService } from '../../services/store.service';
import { RulesService } from '../../services/rules.service';
import { ContextService } from '../../services/context.service';
import { Knot } from '../../models/knot.model';
import { Chain } from '../../models/chain.model';

describe('KnotDetailModalComponent - Chain Actions', () => {
  let component: KnotDetailModalComponent;
  let storeService: StoreService;
  let chainService: ChainService;
  let modalCtrl: jasmine.SpyObj<ModalController>;
  let alertCtrl: jasmine.SpyObj<AlertController>;

  // Helper to create a knot for testing
  function createTestKnot(overrides: Partial<Knot> = {}): Knot {
    const knot: Knot = {
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
      ...overrides,
    };
    return knot;
  }

  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();

    modalCtrl = jasmine.createSpyObj('ModalController', ['dismiss', 'create']);
    alertCtrl = jasmine.createSpyObj('AlertController', ['create']);

    TestBed.configureTestingModule({
      imports: [KnotDetailModalComponent],
      providers: [
        StoreService,
        ChainService,
        { provide: ModalController, useValue: modalCtrl },
        { provide: AlertController, useValue: alertCtrl },
        RulesService,
        ContextService,
      ],
      schemas: [CUSTOM_ELEMENTS_SCHEMA],
    });

    storeService = TestBed.inject(StoreService);
    chainService = TestBed.inject(ChainService);
  });

  function setupComponent(knotId: string): void {
    const fixture = TestBed.createComponent(KnotDetailModalComponent);
    component = fixture.componentInstance;
    component.knotId = knotId;
    component.ngOnInit();
  }

  // ─── chainInfo getter ─────────────────────────────────────────────────

  it('chainInfo should return null when knot has no chainId', () => {
    const knot = createTestKnot({ id: 'knot-no-chain' });
    storeService.createKnot(knot);

    setupComponent('knot-no-chain');

    expect(component.chainInfo).toBeNull();
  });

  it('chainInfo should return name, position, total when knot belongs to a chain', () => {
    // Create a chain
    const chain = chainService.createChain('Mi Cadena');

    // Create knots and add to the chain
    const knot1 = createTestKnot({ id: 'chain-knot-1' });
    const knot2 = createTestKnot({ id: 'chain-knot-2' });
    const knot3 = createTestKnot({ id: 'chain-knot-3' });
    storeService.createKnot(knot1);
    storeService.createKnot(knot2);
    storeService.createKnot(knot3);

    chainService.addKnotToChain('chain-knot-1', chain.id);
    chainService.addKnotToChain('chain-knot-2', chain.id);
    chainService.addKnotToChain('chain-knot-3', chain.id);

    // Test the second knot (position 1, displayed as 2)
    setupComponent('chain-knot-2');

    const info = component.chainInfo;
    expect(info).not.toBeNull();
    expect(info!.name).toBe('Mi Cadena');
    expect(info!.position).toBe(2); // 1-based display: chainOrder 1 + 1 = 2
    expect(info!.total).toBe(3);
  });

  // ─── availableChains getter ───────────────────────────────────────────

  it('availableChains should exclude the knot current chain', () => {
    // Create chains
    const chainA = chainService.createChain('Cadena A');
    const chainB = chainService.createChain('Cadena B');
    const chainC = chainService.createChain('Cadena C');

    // Create a knot that belongs to chainA
    const knot = createTestKnot({ id: 'knot-in-a' });
    storeService.createKnot(knot);
    chainService.addKnotToChain('knot-in-a', chainA.id);

    // Need a second knot in each chain to prevent deletion of empty chains
    const knot2 = createTestKnot({ id: 'knot-holder-b' });
    const knot3 = createTestKnot({ id: 'knot-holder-c' });
    storeService.createKnot(knot2);
    storeService.createKnot(knot3);
    chainService.addKnotToChain('knot-holder-b', chainB.id);
    chainService.addKnotToChain('knot-holder-c', chainC.id);

    setupComponent('knot-in-a');

    const available = component.availableChains;
    const availableIds = available.map(c => c.id);

    expect(availableIds).not.toContain(chainA.id);
    expect(availableIds).toContain(chainB.id);
    expect(availableIds).toContain(chainC.id);
  });

  it('availableChains should be sorted by createdAt descending', () => {
    // Create chains with known timestamps by controlling creation order
    const chainOld = chainService.createChain('Old Chain');
    const chainMid = chainService.createChain('Mid Chain');
    const chainNew = chainService.createChain('New Chain');

    // Create a knot without a chain so all chains appear in availableChains
    const knot = createTestKnot({ id: 'knot-no-chain-sort' });
    storeService.createKnot(knot);

    // Add holder knots so chains aren't deleted
    const knotA = createTestKnot({ id: 'holder-a' });
    const knotB = createTestKnot({ id: 'holder-b' });
    const knotC = createTestKnot({ id: 'holder-c' });
    storeService.createKnot(knotA);
    storeService.createKnot(knotB);
    storeService.createKnot(knotC);
    chainService.addKnotToChain('holder-a', chainOld.id);
    chainService.addKnotToChain('holder-b', chainMid.id);
    chainService.addKnotToChain('holder-c', chainNew.id);

    setupComponent('knot-no-chain-sort');

    const available = component.availableChains;

    // Newest should be first
    expect(available.length).toBe(3);
    expect(available[0].createdAt).toBeGreaterThanOrEqual(available[1].createdAt);
    expect(available[1].createdAt).toBeGreaterThanOrEqual(available[2].createdAt);
  });

  // ─── removeFromChain ──────────────────────────────────────────────────

  it('removeFromChain should call chainService.removeKnotFromChain on confirm', async () => {
    // Create a chain with a knot
    const chain = chainService.createChain('Cadena Remove');
    const knot1 = createTestKnot({ id: 'knot-remove-1' });
    const knot2 = createTestKnot({ id: 'knot-remove-2' });
    storeService.createKnot(knot1);
    storeService.createKnot(knot2);
    chainService.addKnotToChain('knot-remove-1', chain.id);
    chainService.addKnotToChain('knot-remove-2', chain.id);

    setupComponent('knot-remove-1');

    // Mock AlertController to simulate user pressing "Quitar" (confirm)
    let confirmHandler: Function | undefined;
    const mockAlert = {
      present: jasmine.createSpy('present').and.returnValue(Promise.resolve()),
    };
    alertCtrl.create.and.callFake(async (opts: any) => {
      // Find the destructive button and capture its handler
      const destructiveBtn = opts.buttons.find((b: any) => b.role === 'destructive');
      confirmHandler = destructiveBtn?.handler;
      return mockAlert as any;
    });

    spyOn(chainService, 'removeKnotFromChain').and.callThrough();

    await component.removeFromChain();

    // Simulate the user pressing confirm
    expect(confirmHandler).toBeDefined();
    confirmHandler!();

    expect(chainService.removeKnotFromChain).toHaveBeenCalledWith('knot-remove-1');
  });

  it('removeFromChain should NOT modify knot on cancel', async () => {
    // Create a chain with a knot
    const chain = chainService.createChain('Cadena Cancel');
    const knot = createTestKnot({ id: 'knot-cancel' });
    storeService.createKnot(knot);
    chainService.addKnotToChain('knot-cancel', chain.id);

    setupComponent('knot-cancel');

    // Mock AlertController — do NOT call the destructive handler (simulate cancel)
    const mockAlert = {
      present: jasmine.createSpy('present').and.returnValue(Promise.resolve()),
    };
    alertCtrl.create.and.callFake(async (opts: any) => {
      // Don't call any handler (simulates dismiss/cancel)
      return mockAlert as any;
    });

    spyOn(chainService, 'removeKnotFromChain').and.callThrough();

    await component.removeFromChain();

    // Verify the knot was NOT removed from the chain
    expect(chainService.removeKnotFromChain).not.toHaveBeenCalled();

    // Verify the knot still belongs to the chain
    const updatedKnot = storeService.getKnotById('knot-cancel');
    expect(updatedKnot!.chainId).toBe(chain.id);
    expect(updatedKnot!.chainOrder).toBe(0);
  });

  // ─── assignToChain ────────────────────────────────────────────────────

  it('assignToChain should call moveKnotToChain when knot already has a chain', async () => {
    // Create two chains
    const chainA = chainService.createChain('Cadena A');
    const chainB = chainService.createChain('Cadena B');

    // Create knots (need holder in B so it doesn't get deleted)
    const knot = createTestKnot({ id: 'knot-move' });
    const holderKnot = createTestKnot({ id: 'knot-holder-move' });
    storeService.createKnot(knot);
    storeService.createKnot(holderKnot);

    chainService.addKnotToChain('knot-move', chainA.id);
    chainService.addKnotToChain('knot-holder-move', chainB.id);

    setupComponent('knot-move');

    spyOn(chainService, 'moveKnotToChain').and.callThrough();
    spyOn(chainService, 'addKnotToChain').and.callThrough();

    await component.assignToChain(chainB.id);

    expect(chainService.moveKnotToChain).toHaveBeenCalledWith('knot-move', chainB.id);
    expect(chainService.addKnotToChain).not.toHaveBeenCalled();
  });

  it('assignToChain should call addKnotToChain when knot has no chain', async () => {
    // Create a chain
    const chain = chainService.createChain('Cadena Target');

    // Create a knot without a chain, plus a holder for the chain
    const knot = createTestKnot({ id: 'knot-add' });
    const holderKnot = createTestKnot({ id: 'knot-holder-add' });
    storeService.createKnot(knot);
    storeService.createKnot(holderKnot);
    chainService.addKnotToChain('knot-holder-add', chain.id);

    setupComponent('knot-add');

    spyOn(chainService, 'addKnotToChain').and.callThrough();
    spyOn(chainService, 'moveKnotToChain').and.callThrough();

    await component.assignToChain(chain.id);

    expect(chainService.addKnotToChain).toHaveBeenCalledWith('knot-add', chain.id);
    expect(chainService.moveKnotToChain).not.toHaveBeenCalled();
  });
});

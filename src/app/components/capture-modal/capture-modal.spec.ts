import { TestBed } from '@angular/core/testing';
import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { CaptureModalComponent } from './capture-modal.component';
import { ModalController, AlertController } from '@ionic/angular/standalone';
import { StoreService } from '../../services/store.service';
import { ChainService } from '../../services/chain.service';
import { Chain } from '../../models/chain.model';
import { Knot } from '../../models/knot.model';

function makeKnot(overrides: Partial<Knot> = {}): Knot {
  const now = Date.now();
  return {
    id: 'test-' + Math.random().toString(36).slice(2),
    title: 'Knot de prueba',
    status: 'UNLOCKABLE',
    blockReason: 'LAZINESS',
    context: 'ANY',
    weight: 3,
    impact: 3,
    nextStep: 'Hacer algo',
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

describe('CaptureModalComponent - Chain Flow', () => {
  let component: CaptureModalComponent;
  let store: StoreService;
  let chainService: ChainService;
  let mockModalCtrl: jasmine.SpyObj<ModalController>;
  let mockAlertCtrl: jasmine.SpyObj<AlertController>;

  beforeEach(() => {
    localStorage.clear();

    mockModalCtrl = jasmine.createSpyObj('ModalController', ['dismiss', 'create']);
    mockModalCtrl.dismiss.and.returnValue(Promise.resolve(true) as any);

    mockAlertCtrl = jasmine.createSpyObj('AlertController', ['create']);
    mockAlertCtrl.create.and.returnValue(
      Promise.resolve({ present: () => Promise.resolve() }) as any
    );

    TestBed.configureTestingModule({
      imports: [CaptureModalComponent],
      providers: [
        { provide: ModalController, useValue: mockModalCtrl },
        { provide: AlertController, useValue: mockAlertCtrl },
      ],
      schemas: [CUSTOM_ELEMENTS_SCHEMA],
    });

    const fixture = TestBed.createComponent(CaptureModalComponent);
    component = fixture.componentInstance;
    store = TestBed.inject(StoreService);
    chainService = TestBed.inject(ChainService);
  });

  afterEach(() => localStorage.clear());

  // ─── Default state ──────────────────────────────────────────────────────

  it('should default chainOption to "none"', () => {
    expect(component.chainOption).toBe('none');
  });

  // ─── Chain name validation ──────────────────────────────────────────────

  it('should reject empty chain name with validation error', async () => {
    component.title = 'Test knot';
    component.chainOption = 'new';
    component.newChainName = '';

    await component.submit();

    expect(component.chainNameError).toBe('El nombre de la cadena no puede estar vacío.');
    // No knot should have been created
    expect(store.getKnots().length).toBe(0);
  });

  it('should reject whitespace-only chain name with validation error', async () => {
    component.title = 'Test knot';
    component.chainOption = 'new';
    component.newChainName = '   \t  ';

    await component.submit();

    expect(component.chainNameError).toBe('El nombre de la cadena no puede estar vacío.');
    expect(store.getKnots().length).toBe(0);
  });

  it('should accept valid chain name (1-50 chars)', async () => {
    component.title = 'Test knot';
    component.blockReason = 'LAZINESS';
    component.nextStep = 'Do something';
    component.estMinutes = 5;
    component.chainOption = 'new';
    component.newChainName = 'Mi cadena válida';

    await component.submit();

    expect(component.chainNameError).toBe('');
    expect(store.getKnots().length).toBe(1);
    expect(chainService.getChains().length).toBe(1);
  });

  it('should reject chain name longer than 50 chars', async () => {
    component.title = 'Test knot';
    component.chainOption = 'new';
    component.newChainName = 'A'.repeat(51);

    await component.submit();

    expect(component.chainNameError).toBe('El nombre no puede exceder 50 caracteres.');
    expect(store.getKnots().length).toBe(0);
  });

  // ─── Capacity limit ─────────────────────────────────────────────────────

  it('should show capacity error when selected chain has 50 knots', async () => {
    // Create a chain and add 50 knots to it
    const chain = chainService.createChain('Full chain');
    for (let i = 0; i < 50; i++) {
      const knot = makeKnot({ id: `k-${i}` });
      store.createKnot(knot);
      chainService.addKnotToChain(knot.id, chain.id);
    }

    component.title = 'Another knot';
    component.chainOption = 'existing';
    component.selectedChainId = chain.id;

    await component.submit();

    expect(component.chainCapacityError).toBe(
      'Esta cadena alcanzó su capacidad máxima (50 nudos).'
    );
    // No new knot should have been created
    expect(store.getKnots().length).toBe(50);
  });

  // ─── Chains sorted by createdAt descending ──────────────────────────────

  it('should return chains sorted by createdAt descending', () => {
    // Create chains using the service (each gets a createdAt of Date.now())
    // We need to control createdAt, so we create knots and seed localStorage
    // then reload via the service's internal saveChains (which updates BehaviorSubject)
    const chain1 = chainService.createChain('First');
    const chain2 = chainService.createChain('Second');
    const chain3 = chainService.createChain('Third');

    // Manually override createdAt to control ordering
    const chains = chainService.getChains();
    chains.find(c => c.id === chain1.id)!.createdAt = 1000;
    chains.find(c => c.id === chain2.id)!.createdAt = 3000;
    chains.find(c => c.id === chain3.id)!.createdAt = 2000;
    // Use protected saveChains by accessing localStorage directly and re-emitting
    localStorage.setItem('nudos_v1_chains', JSON.stringify(chains));

    // Add a knot to each chain so they exist for getChains
    for (const c of chains) {
      const k = makeKnot();
      store.createKnot(k);
      chainService.addKnotToChain(k.id, c.id);
    }

    const sorted = component.chains;
    expect(sorted.length).toBe(3);
    expect(sorted[0].name).toBe('Second');  // createdAt 3000
    expect(sorted[1].name).toBe('Third');   // createdAt 2000
    expect(sorted[2].name).toBe('First');   // createdAt 1000
  });

  // ─── Submit with "new" chain ────────────────────────────────────────────

  it('on submit with "new" chain option: should create chain and add knot', async () => {
    component.title = 'My chained knot';
    component.blockReason = 'LAZINESS';
    component.nextStep = 'Step one';
    component.estMinutes = 5;
    component.chainOption = 'new';
    component.newChainName = 'Nueva cadena';

    await component.submit();

    const knots = store.getKnots();
    const chains = chainService.getChains();

    expect(knots.length).toBe(1);
    expect(chains.length).toBe(1);
    expect(chains[0].name).toBe('Nueva cadena');
    expect(knots[0].chainId).toBe(chains[0].id);
    expect(knots[0].chainOrder).toBe(0);
  });

  // ─── Submit with "existing" chain ───────────────────────────────────────

  it('on submit with "existing" chain option: should add knot to selected chain', async () => {
    // Seed an existing chain with one knot
    const chain = chainService.createChain('Existing chain');
    const existingKnot = makeKnot({ id: 'existing-k' });
    store.createKnot(existingKnot);
    chainService.addKnotToChain(existingKnot.id, chain.id);

    component.title = 'Second knot';
    component.blockReason = 'LAZINESS';
    component.nextStep = 'Step two';
    component.estMinutes = 3;
    component.chainOption = 'existing';
    component.selectedChainId = chain.id;

    await component.submit();

    const knots = store.getKnots();
    const newKnot = knots.find(k => k.title === 'Second knot');

    expect(newKnot).toBeTruthy();
    expect(newKnot!.chainId).toBe(chain.id);
    expect(newKnot!.chainOrder).toBe(1);
  });

  // ─── Submit with "none" (no chain) ─────────────────────────────────────

  it('on submit with "none" chain option: should not create chain association', async () => {
    component.title = 'Solo knot';
    component.blockReason = 'LAZINESS';
    component.nextStep = 'Go alone';
    component.estMinutes = 2;
    component.chainOption = 'none';

    await component.submit();

    const knots = store.getKnots();
    const chains = chainService.getChains();

    expect(knots.length).toBe(1);
    expect(chains.length).toBe(0);
    expect(knots[0].chainId).toBeFalsy();
    expect(knots[0].chainOrder).toBeFalsy();
  });

  // ─── Select a chain error ──────────────────────────────────────────────

  it('should show "select a chain" error when existing option selected but no chain chosen', async () => {
    component.title = 'Test knot';
    component.chainOption = 'existing';
    component.selectedChainId = null;

    await component.submit();

    expect(component.chainCapacityError).toBe('Seleccioná una cadena.');
    expect(store.getKnots().length).toBe(0);
  });
});

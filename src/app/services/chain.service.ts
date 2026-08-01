import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { Chain } from '../models/chain.model';
import { Knot } from '../models/knot.model';
import { StoreService } from './store.service';
import { generateUUID } from '../utils/utils';

const STORAGE_KEY = 'nudos_v1_chains';

@Injectable({ providedIn: 'root' })
export class ChainService {
  private chainsSubject = new BehaviorSubject<Chain[]>(this.loadChains());
  readonly chains$: Observable<Chain[]> = this.chainsSubject.asObservable();

  constructor(private storeService: StoreService) {
    this.validateIntegrity();
  }

  // ─── Read operations ─────────────────────────────────────────────────────

  getChains(): Chain[] {
    return this.chainsSubject.getValue();
  }

  getChainById(id: string): Chain | undefined {
    return this.getChains().find(c => c.id === id);
  }

  getChainKnots(chainId: string): Knot[] {
    return this.storeService
      .getKnots()
      .filter(k => k.chainId === chainId)
      .sort((a, b) => (a.chainOrder ?? 0) - (b.chainOrder ?? 0));
  }

  getChainSize(chainId: string): number {
    return this.storeService.getKnots().filter(k => k.chainId === chainId).length;
  }

  // ─── Write operations ──────────────────────────────────────────────────

  createChain(name: string): Chain {
    const trimmed = name.trim();
    if (trimmed.length === 0 || trimmed.length > 50) {
      throw new Error('Chain name must be between 1 and 50 characters after trimming.');
    }

    const id = generateUUID();
    const chain: Chain = { id, name: trimmed, createdAt: Date.now() };

    const chains = this.getChains();
    chains.push(chain);
    this.saveChains(chains);

    this.storeService.logEvent('CHAIN_CREATED', { chainId: id });

    return chain;
  }

  // ─── Mutating operations ───────────────────────────────────────────────

  addKnotToChain(knotId: string, chainId: string): void {
    const chain = this.getChainById(chainId);
    if (!chain) {
      throw new Error('La cadena no existe');
    }

    const currentSize = this.getChainSize(chainId);
    if (currentSize >= 50) {
      throw new Error('Esta cadena alcanzó su capacidad máxima (50 nudos)');
    }

    const knot = this.storeService.getKnotById(knotId);
    if (!knot) {
      throw new Error('El nudo no existe');
    }

    this.storeService.updateKnot({ id: knotId, chainId, chainOrder: currentSize });
    this.storeService.logEvent('KNOT_ADDED_TO_CHAIN', { knotId, chainId });
  }

  reorderKnot(chainId: string, fromIndex: number, toIndex: number): void {
    const knots = this.getChainKnots(chainId);
    const maxIndex = knots.length - 1;

    if (fromIndex < 0 || fromIndex > maxIndex || toIndex < 0 || toIndex > maxIndex) {
      throw new Error('Índice fuera de rango');
    }

    // Remove knot from current position and insert at new position
    const [moved] = knots.splice(fromIndex, 1);
    knots.splice(toIndex, 0, moved);

    // Recalculate all chainOrder values as consecutive 0-based integers
    knots.forEach((knot, index) => {
      if (knot.chainOrder !== index) {
        this.storeService.updateKnot({ id: knot.id, chainOrder: index });
      }
    });

    this.storeService.logEvent('CHAIN_REORDERED', { chainId, fromIndex, toIndex });
  }

  removeKnotFromChain(knotId: string): void {
    const knot = this.storeService.getKnotById(knotId);
    if (!knot) {
      throw new Error('El nudo no existe');
    }
    if (!knot.chainId) {
      throw new Error('El nudo no pertenece a ninguna cadena');
    }

    const chainId = knot.chainId;

    // Clear chain fields on the knot
    this.storeService.updateKnot({ id: knotId, chainId: null, chainOrder: null });

    // Recalculate chainOrder for remaining knots in the chain
    const remainingKnots = this.getChainKnots(chainId);

    if (remainingKnots.length === 0) {
      // Delete the chain record if no knots remain
      const chains = this.getChains().filter(c => c.id !== chainId);
      this.saveChains(chains);
    } else {
      // Recalculate consecutive 0-based chainOrder
      remainingKnots.forEach((k, index) => {
        if (k.chainOrder !== index) {
          this.storeService.updateKnot({ id: k.id, chainOrder: index });
        }
      });
    }

    this.storeService.logEvent('KNOT_REMOVED_FROM_CHAIN', { knotId, chainId });
  }

  moveKnotToChain(knotId: string, newChainId: string): void {
    const knot = this.storeService.getKnotById(knotId);
    if (!knot) {
      throw new Error('El nudo no existe');
    }
    if (!knot.chainId) {
      throw new Error('El nudo no pertenece a ninguna cadena');
    }

    const newChain = this.getChainById(newChainId);
    if (!newChain) {
      throw new Error('La cadena destino no existe');
    }

    const newChainSize = this.getChainSize(newChainId);
    if (newChainSize >= 50) {
      throw new Error('Esta cadena alcanzó su capacidad máxima (50 nudos)');
    }

    const oldChainId = knot.chainId;

    // Remove knot from current chain
    this.storeService.updateKnot({ id: knotId, chainId: null, chainOrder: null });

    // Recalculate chainOrder for remaining knots in old chain
    const remainingKnots = this.getChainKnots(oldChainId);

    if (remainingKnots.length === 0) {
      // Delete the old chain if no knots remain
      const chains = this.getChains().filter(c => c.id !== oldChainId);
      this.saveChains(chains);
    } else {
      // Recalculate consecutive 0-based chainOrder
      remainingKnots.forEach((k, index) => {
        if (k.chainOrder !== index) {
          this.storeService.updateKnot({ id: k.id, chainOrder: index });
        }
      });
    }

    // Add knot to new chain at last position
    const newPosition = this.getChainSize(newChainId);
    this.storeService.updateKnot({ id: knotId, chainId: newChainId, chainOrder: newPosition });

    this.storeService.logEvent('KNOT_REMOVED_FROM_CHAIN', { knotId, chainId: oldChainId });
    this.storeService.logEvent('KNOT_ADDED_TO_CHAIN', { knotId, chainId: newChainId });
  }

  deleteChain(chainId: string): void {
    // Get all knots belonging to this chain and clear their chain fields
    const chainKnots = this.getChainKnots(chainId);
    for (const knot of chainKnots) {
      this.storeService.updateKnot({ id: knot.id, chainId: null, chainOrder: null });
    }

    // Remove the chain record
    const chains = this.getChains().filter(c => c.id !== chainId);
    this.saveChains(chains);

    this.storeService.logEvent('CHAIN_DELETED', { chainId });
  }

  // ─── Integrity ──────────────────────────────────────────────────────────

  validateIntegrity(): void {
    const chains = this.getChains();
    const chainIds = new Set(chains.map(c => c.id));
    const allKnots = this.storeService.getKnots();

    // 1. Clear orphan chainIds: knots referencing non-existent chains
    for (const knot of allKnots) {
      if (knot.chainId && !chainIds.has(knot.chainId)) {
        this.storeService.updateKnot({ id: knot.id, chainId: null, chainOrder: null });
      }
    }

    // 2. Delete empty chains (chains with 0 knots referencing them)
    let currentChains = this.getChains();
    const nonEmptyChains: Chain[] = [];
    for (const chain of currentChains) {
      const size = this.getChainSize(chain.id);
      if (size > 0) {
        nonEmptyChains.push(chain);
      }
    }
    if (nonEmptyChains.length !== currentChains.length) {
      this.saveChains(nonEmptyChains);
    }

    // 3. Recalculate consecutive chainOrder for each remaining chain
    const remainingChains = this.getChains();
    for (const chain of remainingChains) {
      const knots = this.getChainKnots(chain.id);
      knots.forEach((knot, index) => {
        if (knot.chainOrder !== index) {
          this.storeService.updateKnot({ id: knot.id, chainOrder: index });
        }
      });
    }
  }

  // ─── Persistence helpers ─────────────────────────────────────────────────

  private loadChains(): Chain[] {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as Chain[];
  }

  protected saveChains(chains: Chain[]): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(chains));
    this.chainsSubject.next(chains);
  }
}

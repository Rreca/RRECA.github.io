import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { Knot, KnotPatch } from '../models/knot.model';
import { Chain } from '../models/chain.model';
import { AppEvent, EventType } from '../models/event.model';
import { generateUUID } from '../utils/utils';

const STORAGE_KEYS = {
  knots: 'nudos_v1_knots',
  events: 'nudos_v1_events',
  chains: 'nudos_v1_chains',
};

const DONE_RETENTION_DAYS = 7;

@Injectable({ providedIn: 'root' })
export class StoreService {
  /** Streams reactivos: los componentes se suscriben y reciben actualizaciones automáticamente */
  private knotsSubject = new BehaviorSubject<Knot[]>([]);
  readonly knots$ = this.knotsSubject.asObservable();

  constructor() {
    this.init();
  }

  // ─── Init ────────────────────────────────────────────────────────────────

  init(): void {
    if (!localStorage.getItem(STORAGE_KEYS.knots)) {
      localStorage.setItem(STORAGE_KEYS.knots, JSON.stringify([]));
    }
    if (!localStorage.getItem(STORAGE_KEYS.events)) {
      localStorage.setItem(STORAGE_KEYS.events, JSON.stringify([]));
    }
    if (!localStorage.getItem(STORAGE_KEYS.chains)) {
      localStorage.setItem(STORAGE_KEYS.chains, JSON.stringify([]));
    }
    this.cleanupDoneKnots();
    this.knotsSubject.next(this.getKnots());
  }

  // ─── Cleanup ─────────────────────────────────────────────────────────────

  private cleanupDoneKnots(): void {
    let knots = this.getKnots();
    const now = Date.now();
    const keepMs = DONE_RETENTION_DAYS * 24 * 60 * 60 * 1000;
    let changed = false;

    knots = knots.filter(k => {
      if (k.status !== 'DONE') return true;
      if (!k.doneAt) {
        (k as Knot).doneAt = k.updatedAt || k.lastTouchedAt || k.createdAt || now;
        changed = true;
      }
      const age = now - (k.doneAt ?? now);
      if (age > keepMs) {
        changed = true;
        return false;
      }
      return true;
    });

    if (changed) {
      this.saveKnotsRaw(knots);
      this.logEvent('DONE_CLEANUP', { keptDays: DONE_RETENTION_DAYS });
    }
  }

  // ─── Raw persistence ─────────────────────────────────────────────────────

  getKnots(): Knot[] {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.knots) ?? '[]') as Knot[];
  }

  private saveKnotsRaw(knots: Knot[]): void {
    localStorage.setItem(STORAGE_KEYS.knots, JSON.stringify(knots));
  }

  /** Guarda y emite el nuevo estado a todos los suscriptores */
  saveKnots(knots: Knot[]): void {
    this.saveKnotsRaw(knots);
    this.knotsSubject.next(knots);
  }

  getEvents(): AppEvent[] {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.events) ?? '[]') as AppEvent[];
  }

  saveEvents(events: AppEvent[]): void {
    localStorage.setItem(STORAGE_KEYS.events, JSON.stringify(events));
  }

  // ─── Chain persistence ───────────────────────────────────────────────────

  getChains(): Chain[] {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.chains) ?? '[]') as Chain[];
  }

  saveChains(chains: Chain[]): void {
    localStorage.setItem(STORAGE_KEYS.chains, JSON.stringify(chains));
  }

  // ─── CRUD ────────────────────────────────────────────────────────────────

  getKnotById(id: string): Knot | undefined {
    return this.getKnots().find(k => k.id === id);
  }

  createKnot(knot: Knot): void {
    if (typeof knot.weight !== 'number') knot.weight = parseInt(String(knot.weight), 10) || 3;
    if (typeof knot.impact !== 'number') knot.impact = parseInt(String(knot.impact), 10) || 3;

    const knots = this.getKnots();
    knots.push(knot);
    this.saveKnots(knots);
    this.logEvent('KNOT_CREATED', { knotId: knot.id });
  }

  updateKnot(patch: KnotPatch): void {
    const knots = this.getKnots();
    const idx = knots.findIndex(k => k.id === patch.id);
    if (idx === -1) return;

    const current = knots[idx];
    const next: Knot = { ...current, ...patch };

    if (typeof next.weight !== 'number') next.weight = parseInt(String(next.weight), 10) || current.weight || 3;
    if (typeof next.impact !== 'number') next.impact = parseInt(String(next.impact), 10) || current.impact || 3;

    next.updatedAt = Date.now();
    next.lastTouchedAt = Date.now();

    // Handle chain cleanup when knot transitions to ARCHIVED
    if (patch.status === 'ARCHIVED' && current.status !== 'ARCHIVED' && current.chainId) {
      const chainId = current.chainId;

      // Clear chain fields on the archived knot
      next.chainId = null;
      next.chainOrder = null;

      knots[idx] = next;

      // Recalculate chainOrder for remaining knots in the chain
      const remainingChainKnots = knots
        .filter(k => k.chainId === chainId)
        .sort((a, b) => (a.chainOrder ?? 0) - (b.chainOrder ?? 0));

      if (remainingChainKnots.length === 0) {
        // Delete the chain record if no members remain
        const chains = this.getChains().filter(c => c.id !== chainId);
        this.saveChains(chains);
      } else {
        // Recalculate consecutive 0-based chainOrder
        remainingChainKnots.forEach((k, index) => {
          const knotInArray = knots.find(kn => kn.id === k.id);
          if (knotInArray) {
            knotInArray.chainOrder = index;
          }
        });
      }

      this.saveKnots(knots);
      this.logEvent('STATUS_CHANGED', { knotId: patch.id, newStatus: patch.status });
    } else {
      knots[idx] = next;
      this.saveKnots(knots);

      if (patch.status && patch.status !== current.status) {
        this.logEvent('STATUS_CHANGED', { knotId: patch.id, newStatus: patch.status });
      } else {
        this.logEvent('KNOT_UPDATED', { knotId: patch.id });
      }
    }
  }

  deleteKnot(id: string): void {
    const knots = this.getKnots();
    const deletedKnot = knots.find(k => k.id === id);
    const before = knots.length;
    const filtered = knots.filter(k => k.id !== id);

    if (filtered.length !== before && deletedKnot) {
      // Handle chain cleanup if the deleted knot belonged to a chain
      if (deletedKnot.chainId) {
        const chainId = deletedKnot.chainId;

        // Recalculate chainOrder for remaining knots in the chain
        const remainingChainKnots = filtered
          .filter(k => k.chainId === chainId)
          .sort((a, b) => (a.chainOrder ?? 0) - (b.chainOrder ?? 0));

        if (remainingChainKnots.length === 0) {
          // Delete the chain record if no members remain
          const chains = this.getChains().filter(c => c.id !== chainId);
          this.saveChains(chains);
        } else {
          // Recalculate consecutive 0-based chainOrder
          remainingChainKnots.forEach((k, index) => {
            const knotInFiltered = filtered.find(fk => fk.id === k.id);
            if (knotInFiltered) {
              knotInFiltered.chainOrder = index;
            }
          });
        }
      }

      this.saveKnots(filtered);
      this.logEvent('KNOT_DELETED', { knotId: id });
    }
  }

  logEvent(type: EventType, meta: Record<string, unknown> = {}): void {
    const events = this.getEvents();
    events.push({
      id: generateUUID(),
      knotId: (meta['knotId'] as string) ?? null,
      type,
      meta,
      createdAt: Date.now(),
    });
    this.saveEvents(events);
  }

  // ─── Import / Export ─────────────────────────────────────────────────────

  exportData(): void {
    const data = {
      version: 1,
      exportedAt: Date.now(),
      knots: this.getKnots(),
      events: this.getEvents(),
      chains: this.getChains(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'nudos_backup.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  importData(raw: string): void {
    const data = JSON.parse(raw) as { knots: Knot[]; events: AppEvent[]; chains?: Chain[] };
    if (!Array.isArray(data.knots) || !Array.isArray(data.events)) {
      throw new Error('JSON inválido: faltan "knots" y/o "events".');
    }

    const knots: Knot[] = data.knots.map(k => ({
      ...k,
      weight: typeof k.weight === 'number' ? k.weight : parseInt(String(k.weight), 10) || 3,
      impact: typeof k.impact === 'number' ? k.impact : parseInt(String(k.impact), 10) || 3,
      lastTouchedAt: k.lastTouchedAt ?? k.updatedAt ?? k.createdAt ?? Date.now(),
      updatedAt: k.updatedAt ?? k.createdAt ?? Date.now(),
      createdAt: k.createdAt ?? Date.now(),
    }));

    const chains: Chain[] = Array.isArray(data.chains) ? data.chains : [];

    this.saveChains(chains);
    this.saveKnots(knots);
    this.saveEvents(data.events);

    // Run integrity validation: clear orphan chainIds, delete empty chains, recalculate order
    this.validateChainIntegrity();
  }

  // ─── Chain Integrity ──────────────────────────────────────────────────────

  private validateChainIntegrity(): void {
    let chains = this.getChains();
    const chainIds = new Set(chains.map(c => c.id));
    let knots = this.getKnots();
    let knotsChanged = false;

    // 1. Clear orphan chainIds: knots referencing non-existent chains
    for (const knot of knots) {
      if (knot.chainId && !chainIds.has(knot.chainId)) {
        knot.chainId = null;
        knot.chainOrder = null;
        knotsChanged = true;
      }
    }

    if (knotsChanged) {
      this.saveKnots(knots);
    }

    // 2. Delete empty chains (chains with 0 knots referencing them)
    const nonEmptyChains = chains.filter(chain =>
      knots.some(k => k.chainId === chain.id)
    );
    if (nonEmptyChains.length !== chains.length) {
      chains = nonEmptyChains;
      this.saveChains(chains);
    }

    // 3. Recalculate consecutive chainOrder for each remaining chain
    knots = this.getKnots();
    let orderChanged = false;
    for (const chain of chains) {
      const chainKnots = knots
        .filter(k => k.chainId === chain.id)
        .sort((a, b) => (a.chainOrder ?? 0) - (b.chainOrder ?? 0));

      chainKnots.forEach((knot, index) => {
        if (knot.chainOrder !== index) {
          knot.chainOrder = index;
          orderChanged = true;
        }
      });
    }

    if (orderChanged) {
      this.saveKnots(knots);
    }
  }

  // ─── Reset ───────────────────────────────────────────────────────────────

  resetAll(): void {
    const prefixes = ['nudos_', 'NUDOS_'];
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k) keys.push(k);
    }
    keys.forEach(k => {
      if (prefixes.some(p => k.startsWith(p))) localStorage.removeItem(k);
    });
    this.knotsSubject.next([]);
  }
}

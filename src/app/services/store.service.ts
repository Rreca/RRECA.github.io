import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { Knot, KnotPatch } from '../models/knot.model';
import { AppEvent, EventType } from '../models/event.model';
import { generateUUID } from '../utils/utils';

const STORAGE_KEYS = {
  knots: 'nudos_v1_knots',
  events: 'nudos_v1_events',
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

    knots[idx] = next;
    this.saveKnots(knots);

    if (patch.status && patch.status !== current.status) {
      this.logEvent('STATUS_CHANGED', { knotId: patch.id, newStatus: patch.status });
    } else {
      this.logEvent('KNOT_UPDATED', { knotId: patch.id });
    }
  }

  deleteKnot(id: string): void {
    const knots = this.getKnots();
    const before = knots.length;
    const filtered = knots.filter(k => k.id !== id);
    this.saveKnots(filtered);
    if (filtered.length !== before) {
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
    const data = JSON.parse(raw) as { knots: Knot[]; events: AppEvent[] };
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

    this.saveKnots(knots);
    this.saveEvents(data.events);
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

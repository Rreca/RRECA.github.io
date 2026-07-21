import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { Knot, KnotContext, ContextFilter } from '../models/knot.model';
import { StoreService } from './store.service';

const CONTEXT_KEYS = {
  navFilter: 'nudos_nav_context_filter_v1',
  migrated: 'nudos_context_migrated_v1',
};

@Injectable({ providedIn: 'root' })
export class ContextService {
  private filterSubject = new BehaviorSubject<ContextFilter>('ALL');
  readonly filter$ = this.filterSubject.asObservable();

  constructor(private store: StoreService) {
    const saved = this.normalizeFilter(localStorage.getItem(CONTEXT_KEYS.navFilter));
    this.filterSubject.next(saved);
  }

  // ─── Filtro activo ───────────────────────────────────────────────────────

  getActiveFilter(): ContextFilter {
    return this.filterSubject.value;
  }

  setActiveFilter(filter: string): ContextFilter {
    const f = this.normalizeFilter(filter);
    localStorage.setItem(CONTEXT_KEYS.navFilter, f);
    this.filterSubject.next(f);
    return f;
  }

  // ─── Normalización ───────────────────────────────────────────────────────

  normalizeContext(raw: string | null | undefined): KnotContext {
    const v = String(raw ?? '').trim().toUpperCase();
    if (!v || v === 'ALL' || v === 'TODOS' || v === 'ANY' || v === 'CUALQUIERA') return 'ANY';
    if (v === 'HOME' || v === 'CASA' || v === 'HOGAR') return 'HOME';
    if (v === 'STREET' || v === 'CALLE' || v === 'OUT' || v === 'OUTSIDE') return 'STREET';
    if (v === 'WORK' || v === 'TRABAJO' || v === 'OFICINA' || v === 'OFFICE') return 'WORK';
    return 'ANY';
  }

  normalizeFilter(raw: string | null | undefined): ContextFilter {
    const v = String(raw ?? '').trim().toUpperCase();
    if (!v || v === 'ALL' || v === 'TODOS') return 'ALL';
    if (v === 'HOME' || v === 'CASA' || v === 'HOGAR') return 'HOME';
    if (v === 'STREET' || v === 'CALLE') return 'STREET';
    if (v === 'WORK' || v === 'TRABAJO') return 'WORK';
    if (v === 'ANY' || v === 'CUALQUIERA') return 'ANY';
    return 'ALL';
  }

  getKnotContext(k: Knot): KnotContext {
    const raw = k.context || (k as unknown as Record<string, string>)['ctx'] || 'ANY';
    return this.normalizeContext(raw);
  }

  getContextSource(k: Knot): 'MANUAL' | 'AUTO' {
    return k.contextSource === 'MANUAL' ? 'MANUAL' : 'AUTO';
  }

  contextLabel(ctx: KnotContext): string {
    if (ctx === 'HOME') return 'Casa';
    if (ctx === 'STREET') return 'Calle';
    if (ctx === 'WORK') return 'Trabajo';
    return 'ANY';
  }

  contextIcon(ctx: KnotContext): string {
    if (ctx === 'HOME') return '🏠';
    if (ctx === 'STREET') return '🚶';
    if (ctx === 'WORK') return '💼';
    return '🌐';
  }

  contextBadgeClass(ctx: KnotContext): string {
    const map: Record<KnotContext, string> = {
      HOME: 'ctx-home',
      STREET: 'ctx-street',
      WORK: 'ctx-work',
      ANY: 'ctx-any',
    };
    return map[ctx] ?? 'ctx-any';
  }

  // ─── Visibilidad ─────────────────────────────────────────────────────────

  isKnotVisibleInFilter(k: Knot, filter?: ContextFilter): boolean {
    const f = filter ?? this.getActiveFilter();
    if (f === 'ALL') return true;
    const kc = this.getKnotContext(k);
    if (kc === 'ANY') return true;
    return kc === f;
  }

  // ─── Heurística de contexto ──────────────────────────────────────────────

  suggestContext(title: string, nextStep?: string | null): KnotContext {
    const t = `${title ?? ''} ${nextStep ?? ''}`.toLowerCase();

    if (/\b(ferreter[ií]a|panader[ií]a|super|kiosco|comprar|ir a|salir|llevar|retirar|pasar por|env[ií]o|correo|mercado libre|pagar en|banco|cajero)\b/.test(t)) {
      return 'STREET';
    }
    if (/\b(reuni[oó]n|meeting|jira|ticket|deploy|merge|pull request|pr\b|commit|release|prod|stag|qa|cliente|slack|email|documentaci[oó]n|spec)\b/.test(t)) {
      return 'WORK';
    }
    if (/\b(limpiar|lavar|cocinar|pintar|arreglar|reparar|mueble|pared|patio|casa|ba[nñ]o|cocina)\b/.test(t)) {
      return 'HOME';
    }
    return 'ANY';
  }

  // ─── Context override en store ───────────────────────────────────────────

  setKnotContextManual(id: string, ctx: string): void {
    this.store.updateKnot({ id, context: this.normalizeContext(ctx), contextSource: 'MANUAL', updatedAt: Date.now() });
  }

  setKnotContextAuto(id: string, ctx: KnotContext): void {
    this.store.updateKnot({ id, context: ctx, contextSource: 'AUTO', updatedAt: Date.now() });
  }

  // ─── Migración one-time ───────────────────────────────────────────────────

  migrateKnotContextsOnce(): void {
    if (localStorage.getItem(CONTEXT_KEYS.migrated) === '1') return;

    const knots = this.store.getKnots();
    let changed = 0;

    knots.forEach(k => {
      const newCtx = this.getKnotContext(k);
      if (!k.context) {
        this.store.updateKnot({ id: k.id, context: 'ANY' });
        changed++;
      } else if (k.context !== newCtx) {
        this.store.updateKnot({ id: k.id, context: newCtx });
        changed++;
      }
    });

    localStorage.setItem(CONTEXT_KEYS.migrated, '1');
    if (changed) this.store.logEvent('CONTEXT_MIGRATED', { changed });
  }
}

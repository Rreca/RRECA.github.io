import { Injectable } from '@angular/core';
import { Knot, KnotStatus } from '../models/knot.model';
import { StoreService } from './store.service';
import { NotificationService } from './notification.service';
import { GoalService } from './goal.service';

export interface CaptureResult {
  canCapture: boolean;
  message: string;
  stale24h: boolean;
}

@Injectable({ providedIn: 'root' })
export class RulesService {
  constructor(
    private store: StoreService,
    private notif: NotificationService,
    private goal: GoalService,
  ) {}

  // ─── Reglas de cupo ──────────────────────────────────────────────────────

  canMoveToUnlockable(): boolean {
    const count = this.store.getKnots().filter(k => k.status === 'UNLOCKABLE').length;
    return count < 3;
  }

  canStartDoing(): boolean {
    return !this.store.getKnots().some(k => k.status === 'DOING');
  }

  canCaptureNewKnot(): CaptureResult {
    const knots = this.store.getKnots();
    const unlockables = knots.filter(k => k.status === 'UNLOCKABLE');
    const unlockableCount = unlockables.length;
    const hasDoing = knots.some(k => k.status === 'DOING');

    const baseCanCapture = unlockableCount < 3 && !hasDoing;

    const now = Date.now();
    let stale24h = false;

    if (unlockableCount >= 3) {
      const newestTouch = unlockables
        .map(k => k.lastTouchedAt ?? 0)
        .sort((a, b) => b - a)[0] ?? 0;
      stale24h = now - newestTouch > 24 * 60 * 60 * 1000;
    }

    const message = stale24h
      ? 'Sistema lleno hace +24h (no tocaste tus DESBLOQUEABLES). Antes de capturar: tocá 1 (hacer 5 min, dividir o mandarlo a ALGÚN DÍA).'
      : 'Sistema lleno. Para capturar algo nuevo, primero: (1) hacé 5 min un DESBLOQUEABLE, o (2) mandá uno a ALGÚN DÍA, o (3) pausá/terminá el EN PROGRESO.';

    return { canCapture: baseCanCapture, message, stale24h };
  }

  // ─── Validaciones ────────────────────────────────────────────────────────

  validateNewKnot(knot: Knot): Knot {
    if (!knot.title || !knot.blockReason) {
      throw new Error('Título y motivo de bloqueo requeridos.');
    }

    knot.weight = this.normalizeFriction(knot.weight);
    knot.impact = this.normalizeImpact(knot.impact);

    if (['NO_START', 'LAZINESS', 'FEAR'].includes(knot.blockReason)) {
      if (!knot.nextStep?.trim() || (knot.estMinutes ?? 0) > 5) {
        throw new Error('Para este motivo: "Próximo paso" obligatorio y "Minutos estimados" <= 5.');
      }
      knot.status = 'UNLOCKABLE';
    } else if (knot.blockReason === 'EXTERNAL') {
      if (!knot.externalWait?.trim()) {
        throw new Error('Si depende de un externo, "Espera externa" es obligatorio.');
      }
      knot.status = 'BLOCKED';
    } else if (knot.blockReason === 'NOT_TODAY') {
      knot.status = 'SOMEDAY';
      knot.nextStep = null;
      knot.estMinutes = null;
      knot.externalWait = null;
    }

    const knots = this.store.getKnots();
    if (knot.status === 'UNLOCKABLE' && knots.filter(k => k.status === 'UNLOCKABLE').length >= 3) {
      throw new Error('Máximo 3 DESBLOQUEABLES.');
    }

    return knot;
  }

  validateEditedKnot(candidate: Knot): Knot {
    if (!candidate.title || !candidate.blockReason) {
      throw new Error('Título y motivo de bloqueo son obligatorios.');
    }

    candidate.estMinutes = candidate.estMinutes ? parseInt(String(candidate.estMinutes), 10) : null;
    candidate.weight = this.normalizeFriction(candidate.weight);
    candidate.impact = this.normalizeImpact(candidate.impact);

    if (['NO_START', 'LAZINESS', 'FEAR'].includes(candidate.blockReason)) {
      if (!candidate.nextStep?.trim()) {
        throw new Error('Para este motivo, el "Próximo paso" es obligatorio.');
      }
      if (candidate.estMinutes && candidate.estMinutes > 5) {
        throw new Error('Para este motivo, "Minutos estimados" debe ser <= 5.');
      }
      candidate.status = 'UNLOCKABLE';
      candidate.externalWait = null;
    } else if (candidate.blockReason === 'EXTERNAL') {
      if (!candidate.externalWait?.trim()) {
        throw new Error('Si depende de un externo, "Espera externa" es obligatorio.');
      }
      candidate.status = 'BLOCKED';
    } else if (candidate.blockReason === 'NOT_TODAY') {
      candidate.status = 'SOMEDAY';
      candidate.nextStep = null;
      candidate.externalWait = null;
      candidate.estMinutes = null;
    }

    if (candidate.status === 'UNLOCKABLE') {
      const knots = this.store.getKnots();
      const others = knots.filter(k => k.status === 'UNLOCKABLE' && k.id !== candidate.id).length;
      if (others >= 3) {
        throw new Error('No hay cupo: máximo 3 DESBLOQUEABLES.');
      }
    }

    return candidate;
  }

  // ─── Transiciones ────────────────────────────────────────────────────────

  transitionToDoing(knotId: string): void {
    if (!this.canStartDoing()) {
      throw new Error('Ya hay un EN PROGRESO. Pausá o terminá el actual.');
    }
    const knot = this.store.getKnotById(knotId);
    if (!knot) throw new Error('Nudo no encontrado.');
    if (knot.status !== 'UNLOCKABLE') {
      throw new Error('Solo un DESBLOQUEABLE puede ir a EN PROGRESO.');
    }
    this.store.updateKnot({ id: knotId, status: 'DOING' });
  }

  transitionToSomeday(knotId: string): void {
    this.store.updateKnot({ id: knotId, status: 'SOMEDAY' });
  }

  transitionToPauseDoing(knotId: string): void {
    const knot = this.store.getKnotById(knotId);
    if (!knot || knot.status !== 'DOING') return;
    if (!this.canMoveToUnlockable()) {
      throw new Error('No hay cupo para DESBLOQUEABLE.');
    }
    this.store.updateKnot({ id: knotId, status: 'UNLOCKABLE' });
  }

  transitionToDone(knotId: string, feltLighter: boolean): void {
    const knot = this.store.getKnotById(knotId);
    if (!knot) throw new Error('Nudo no encontrado.');
    this.store.updateKnot({ id: knotId, status: 'DONE', doneAt: Date.now() });
    this.store.logEvent('KNOT_DONE', { knotId, feltLighter });

    // If recurring, schedule next recurrence
    if (knot.recurrence) {
      const nextAt = this.computeNextRecurrence(knot.recurrence);
      this.store.updateKnot({ id: knotId, nextRecurrenceAt: nextAt });
    }

    // Celebración si se cumplió la meta del día
    const doneToday = this.goal.countDoneToday();
    const dailyGoal = this.goal.getDailyGoal();
    if (doneToday >= dailyGoal) {
      this.notif.scheduleCelebration();
    }
  }

  /** Compute next recurrence timestamp (next day at 00:00 for daily, +7 days for weekly) */
  private computeNextRecurrence(type: 'daily' | 'weekly'): number {
    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (type === 'daily') {
      next.setDate(next.getDate() + 1);
    } else {
      next.setDate(next.getDate() + 7);
    }
    return next.getTime();
  }

  /** Recycle recurring knots that are due. Call on app open. */
  recycleRecurringKnots(): void {
    const knots = this.store.getKnots();
    const now = Date.now();
    for (const knot of knots) {
      if (knot.recurrence && knot.status === 'DONE' && knot.nextRecurrenceAt && knot.nextRecurrenceAt <= now) {
        this.store.updateKnot({
          id: knot.id,
          status: 'UNLOCKABLE',
          doneAt: null,
          nextRecurrenceAt: null,
          updatedAt: now,
          lastTouchedAt: now,
        });
        this.store.logEvent('KNOT_RECYCLED', { knotId: knot.id, recurrence: knot.recurrence });
      }
    }
  }

  archiveKnot(id: string, reason = 'OTHER'): void {
    const knot = this.store.getKnotById(id);
    if (!knot) return;
    this.store.updateKnot({
      id,
      status: 'ARCHIVED',
      archiveReason: reason as Knot['archiveReason'],
      archivedAt: Date.now(),
      updatedAt: Date.now(),
      lastTouchedAt: Date.now(),
    });
    this.store.logEvent('KNOT_ARCHIVED', { id, reason });
  }

  restoreArchivedToSomeday(id: string): void {
    const knot = this.store.getKnotById(id);
    if (!knot) return;
    this.store.updateKnot({
      id,
      status: 'SOMEDAY',
      archiveReason: null,
      archivedAt: null,
      updatedAt: Date.now(),
      lastTouchedAt: Date.now(),
    });
    this.store.logEvent('KNOT_RESTORED', { id, to: 'SOMEDAY' });
  }

  // ─── Normalización ───────────────────────────────────────────────────────

  normalizeImpact(v: number | string | null | undefined): number {
    const n = parseInt(String(v ?? 3), 10);
    if (isNaN(n)) return 3;
    return Math.max(1, Math.min(5, n));
  }

  normalizeFriction(v: number | string | null | undefined): number {
    const n = parseInt(String(v ?? 3), 10);
    if (isNaN(n)) return 3;
    return Math.max(1, Math.min(5, n));
  }

  getFriction(k: Knot): number {
    return typeof k.weight === 'number' ? k.weight : parseInt(String(k.weight), 10) || 3;
  }

  getImpact(k: Knot): number {
    return typeof k.impact === 'number' ? k.impact : parseInt(String(k.impact), 10) || 3;
  }

  priorityScore(k: Knot): number {
    return this.getImpact(k) - this.getFriction(k);
  }
}

import { Injectable } from '@angular/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { StoreService } from './store.service';
import { GoalService } from './goal.service';

export interface NotificationSettings {
  enabled: boolean;
  morningHour: number;
  morningMinute: number;
  streakHour: number;
  streakMinute: number;
  celebrationEnabled: boolean;
  inactivityEnabled: boolean;
  maxPerDay: number;          // límite diario de notificaciones (default 2)
}

const STORAGE_KEY       = 'nudos_notif_settings_v1';
const LAST_OPEN_KEY     = 'nudos_notif_last_open_v1';
const DAILY_COUNT_KEY   = 'nudos_notif_daily_count_v1';  // { date: 'YYYY-MM-DD', count: number }
const CHANNEL_ID        = 'nudos_default';

const NOTIF_IDS = {
  MORNING:      1001,
  STREAK:       1002,
  CELEBRATION:  1003,
  INACTIVITY:   1004,
  WEEKLY_RETRO: 1005,
  TEST:         9999,
};

const DEFAULT_SETTINGS: NotificationSettings = {
  enabled:            true,
  morningHour:        9,
  morningMinute:      0,
  streakHour:         22,
  streakMinute:       0,
  celebrationEnabled: true,
  inactivityEnabled:  true,
  maxPerDay:          2,
};

@Injectable({ providedIn: 'root' })
export class NotificationService {

  private channelCreated = false;

  constructor(
    private store: StoreService,
    private goal: GoalService,
  ) {}

  // ─── Settings ────────────────────────────────────────────────────────────

  getSettings(): NotificationSettings {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : { ...DEFAULT_SETTINGS };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  saveSettings(partial: Partial<NotificationSettings>): void {
    const next = { ...this.getSettings(), ...partial };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }

  // ─── Canal Android (requerido Android 8+) ────────────────────────────────

  private async ensureChannel(): Promise<void> {
    if (this.channelCreated) return;
    try {
      await LocalNotifications.createChannel({
        id:          CHANNEL_ID,
        name:        'Nudos',
        description: 'Recordatorios y alertas de Nudos',
        importance:  4,   // HIGH
        visibility:  1,   // PUBLIC
        sound:       'default',
        vibration:   true,
      });
      await this.registerActionTypes();
      this.channelCreated = true;
    } catch { /* silencioso en iOS */ }
  }

  private async registerActionTypes(): Promise<void> {
    try {
      await LocalNotifications.registerActionTypes({
        types: [{
          id: 'MORNING_ACTIONS',
          actions: [{
            id: 'quick_start_timer',
            title: '⏱ Arrancar 5 min',
          }],
        }],
      });
    } catch { /* silencioso */ }
  }

  // ─── Permisos ────────────────────────────────────────────────────────────

  async requestPermission(): Promise<boolean> {
    try {
      const result = await LocalNotifications.requestPermissions();
      return result.display === 'granted';
    } catch (e) {
      console.error('requestPermission error:', e);
      return false;
    }
  }

  async hasPermission(): Promise<boolean> {
    try {
      const result = await LocalNotifications.checkPermissions();
      return result.display === 'granted';
    } catch {
      return false;
    }
  }

  // ─── Apertura ────────────────────────────────────────────────────────────

  recordAppOpen(): void {
    localStorage.setItem(LAST_OPEN_KEY, String(Date.now()));
  }

  private getDaysSinceLastOpen(): number {
    const last = parseInt(localStorage.getItem(LAST_OPEN_KEY) ?? '0', 10);
    if (!last) return 0;
    return Math.floor((Date.now() - last) / (24 * 60 * 60 * 1000));
  }

  // ─── Contador diario ─────────────────────────────────────────────────────

  private getTodayKey(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }

  private getDailyCount(): number {
    try {
      const raw = localStorage.getItem(DAILY_COUNT_KEY);
      if (!raw) return 0;
      const obj = JSON.parse(raw);
      return obj.date === this.getTodayKey() ? (obj.count ?? 0) : 0;
    } catch { return 0; }
  }

  private incrementDailyCount(): void {
    const count = this.getDailyCount() + 1;
    localStorage.setItem(DAILY_COUNT_KEY, JSON.stringify({ date: this.getTodayKey(), count }));
  }

  private canSendMore(): boolean {
    const { maxPerDay } = this.getSettings();
    return this.getDailyCount() < maxPerDay;
  }

  // ─── Mensajes dinámicos ──────────────────────────────────────────────────

  /** Returns the first DOING or UNLOCKABLE knot for quick-start timer */
  getQuickStartKnot(): { id: string; title: string; estMinutes: number | null } | null {
    const knots = this.store.getKnots();
    const doing = knots.find(k => k.status === 'DOING');
    if (doing) return { id: doing.id, title: doing.title, estMinutes: (doing as any).estMinutes ?? null };
    const unlockable = knots.find(k => k.status === 'UNLOCKABLE');
    if (unlockable) return { id: unlockable.id, title: unlockable.title, estMinutes: (unlockable as any).estMinutes ?? null };
    return null;
  }

  private buildMorningMessage(): { title: string; body: string } | null {
    const knots      = this.store.getKnots();
    const doing      = knots.filter(k => k.status === 'DOING');
    const unlockable = knots.filter(k => k.status === 'UNLOCKABLE');
    const passive    = knots.filter(k => k.status === 'BLOCKED' || k.status === 'SOMEDAY');

    if (doing.length)           return { title: 'Tenés algo en progreso', body: '5 minutos y lo cerrás. ¿Arrancamos?' };
    if (unlockable.length > 1)  return { title: `${unlockable.length} desbloqueables esperando`, body: 'Elegí uno y arrancá. Solo 5 minutos.' };
    if (unlockable.length === 1) return { title: 'Hay 1 cosa lista para hacer', body: '¿Arrancamos? Solo 5 minutos.' };
    if (passive.length)         return { title: 'Sistema en pausa', body: 'Desbloqueá algo para seguir avanzando.' };
    return null;
  }

  private buildStreakMessage(): { title: string; body: string } {
    const streak = this.goal.getCurrentStreak();
    if (streak >= 3) return { title: `⚠ Tu racha de ${streak} días termina a medianoche`, body: '1 cosa. 5 minutos. No lo pierdas.' };
    if (streak >= 1) return { title: '⚠ Mínimo del día pendiente', body: 'No lo dejes para mañana. 1 cosa ahora.' };
    return { title: 'Hoy podés arrancar una racha', body: '1 cosa pequeña ahora.' };
  }

  buildCelebrationMessage(): { title: string; body: string } {
    const done   = this.goal.countDoneToday();
    const goal   = this.goal.getDailyGoal();
    const streak = this.goal.getCurrentStreak();
    if (done > goal) return { title: `🔥 ${done} hechos hoy`, body: 'Más de lo mínimo. Bien.' };
    return { title: '✅ Mínimo cumplido', body: `La cadena sigue. Racha: ${streak} día(s).` };
  }

  // ─── Helper de scheduling ────────────────────────────────────────────────

  private async doSchedule(id: number, title: string, body: string, at: Date): Promise<void> {
    await this.ensureChannel();
    await LocalNotifications.schedule({
      notifications: [{
        id,
        title,
        body,
        channelId: CHANNEL_ID,
        schedule:  { at, repeats: false },
        smallIcon: 'ic_stat_nudos',
        largeIcon: 'ic_launcher',
        iconColor: '#2563EB',
        extra: { action: 'open' },
      }],
    });
  }

  // ─── Scheduling ──────────────────────────────────────────────────────────

  async scheduleAll(): Promise<void> {
    const s = this.getSettings();
    if (!s.enabled) return;
    const granted = await this.hasPermission();
    if (!granted) return;

    await this.cancelAll();
    await this.scheduleMorning();
    await this.scheduleStreakProtection();
    if (s.inactivityEnabled) await this.scheduleInactivityReminder();
    await this.scheduleWeeklyRetro();
  }

  async cancelAll(): Promise<void> {
    try {
      await LocalNotifications.cancel({
        notifications: Object.values(NOTIF_IDS).map(id => ({ id })),
      });
    } catch { /* silencioso */ }
  }

  async cancelToday(): Promise<void> {
    try {
      await LocalNotifications.cancel({
        notifications: [{ id: NOTIF_IDS.MORNING }, { id: NOTIF_IDS.STREAK }],
      });
    } catch { /* silencioso */ }
  }

  async scheduleMorning(): Promise<void> {
    const s   = this.getSettings();
    const msg = this.buildMorningMessage();
    if (!msg) return;

    const now  = new Date();
    const next = new Date();
    next.setHours(s.morningHour, s.morningMinute, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);

    try {
      await this.ensureChannel();
      await LocalNotifications.schedule({
        notifications: [{
          id: NOTIF_IDS.MORNING,
          title: msg.title,
          body: msg.body,
          channelId: CHANNEL_ID,
          schedule: { at: next, repeats: false },
          smallIcon: 'ic_stat_nudos',
          largeIcon: 'ic_launcher',
          iconColor: '#2563EB',
          extra: { action: 'open' },
          actionTypeId: 'MORNING_ACTIONS',
        }],
      });
    } catch (e) { console.error('scheduleMorning error:', e); }
  }

  async scheduleStreakProtection(): Promise<void> {
    if (this.goal.countDoneToday() >= this.goal.getDailyGoal()) return;

    const s    = this.getSettings();
    const now  = new Date();
    const next = new Date();
    next.setHours(s.streakHour, s.streakMinute, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);

    const msg = this.buildStreakMessage();
    try {
      await this.doSchedule(NOTIF_IDS.STREAK, msg.title, msg.body, next);
    } catch (e) { console.error('scheduleStreak error:', e); }
  }

  async scheduleCelebration(): Promise<void> {
    const s = this.getSettings();
    if (!s.celebrationEnabled) return;
    if (!this.canSendMore()) return;
    const granted = await this.hasPermission();
    if (!granted) return;

    // Solo disparar si la app está en background
    // Si document.hidden es false significa que el usuario tiene la app abierta
    if (!document.hidden) return;

    const msg    = this.buildCelebrationMessage();
    const fireAt = new Date(Date.now() + 3000);

    try {
      await LocalNotifications.cancel({ notifications: [{ id: NOTIF_IDS.STREAK }] });
      await this.doSchedule(NOTIF_IDS.CELEBRATION, msg.title, msg.body, fireAt);
      this.incrementDailyCount();
    } catch (e) { console.error('scheduleCelebration error:', e); }
  }

  async scheduleInactivityReminder(): Promise<void> {
    if (!this.canSendMore()) return;
    const days = this.getDaysSinceLastOpen();
    if (days < 2) return;

    const actives = this.store.getKnots().filter(k =>
      ['DOING', 'UNLOCKABLE', 'BLOCKED', 'SOMEDAY'].includes(k.status)
    );
    if (!actives.length) return;

    const fireAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    try {
      await this.doSchedule(
        NOTIF_IDS.INACTIVITY,
        'Nudos te espera',
        `Llevás ${days} días sin avanzar. 1 cosa, ahora.`,
        fireAt
      );
      this.incrementDailyCount();
    } catch (e) { console.error('scheduleInactivity error:', e); }
  }

  // ─── Weekly Retro (domingo 20h) ───────────────────────────────────────────

  async scheduleWeeklyRetro(): Promise<void> {
    const now  = new Date();
    const next = new Date();
    // Calcular próximo domingo
    const dayOfWeek = now.getDay(); // 0=domingo
    const daysUntilSunday = dayOfWeek === 0 ? 0 : 7 - dayOfWeek;
    next.setDate(now.getDate() + daysUntilSunday);
    next.setHours(20, 0, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 7);

    try {
      await this.doSchedule(
        NOTIF_IDS.WEEKLY_RETRO,
        '📊 Tu semana en Nudos',
        'Mirá cuánto avanzaste. Tocá para ver.',
        next
      );
    } catch (e) { console.error('scheduleWeeklyRetro error:', e); }
  }

  // ─── Test ────────────────────────────────────────────────────────────────

  async sendTestNotification(): Promise<void> {
    const granted = await this.requestPermission();
    if (!granted) return;

    const fireAt = new Date(Date.now() + 5000);
    try {
      await LocalNotifications.cancel({ notifications: [{ id: NOTIF_IDS.TEST }] });
      await this.doSchedule(
        NOTIF_IDS.TEST,
        '🔔 Nudos — Prueba',
        'Las notificaciones están funcionando. Cerrá la app para verla.',
        fireAt
      );
    } catch (e) {
      console.error('sendTestNotification error:', e);
    }
  }

}

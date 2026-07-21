import { Injectable } from '@angular/core';
import { StoreService } from './store.service';
import { Knot } from '../models/knot.model';
import { startOfTodayTs, dayKey, startOfWeekTsMonday } from '../utils/utils';

const GOAL_KEY = 'nudos_goal_daily_min_done_v1';

@Injectable({ providedIn: 'root' })
export class GoalService {
  constructor(private store: StoreService) {}

  getDailyGoal(): number {
    const v = parseInt(localStorage.getItem(GOAL_KEY) ?? '1', 10);
    return Number.isFinite(v) && v >= 1 && v <= 20 ? v : 1;
  }

  setDailyGoal(n: number): number {
    const v = Math.max(1, Math.min(20, parseInt(String(n), 10) || 1));
    localStorage.setItem(GOAL_KEY, String(v));
    return v;
  }

  countDoneToday(knots?: Knot[]): number {
    const list = knots ?? this.store.getKnots();
    const start = startOfTodayTs();
    const end = start + 24 * 60 * 60 * 1000;
    return list.filter(k => {
      if (k.status !== 'DONE') return false;
      const ts = k.doneAt ?? k.updatedAt ?? k.lastTouchedAt ?? k.createdAt ?? 0;
      return ts >= start && ts < end;
    }).length;
  }

  getDoneByDayLast7Days(knots?: Knot[]): { key: string; date: Date; count: number }[] {
    const list = knots ?? this.store.getKnots();
    const now = new Date();
    const days: { key: string; date: Date; count: number }[] = [];

    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      days.push({ key: dayKey(d.getTime()), date: d, count: 0 });
    }

    const map: Record<string, { key: string; date: Date; count: number }> = {};
    days.forEach(x => (map[x.key] = x));

    list
      .filter(k => k.status === 'DONE')
      .forEach(k => {
        const ts = k.doneAt ?? k.updatedAt ?? k.lastTouchedAt ?? k.createdAt;
        if (!ts) return;
        const key = dayKey(ts);
        if (map[key]) map[key].count++;
      });

    return days;
  }

  getCurrentStreak(knots?: Knot[]): number {
    const days = this.getDoneByDayLast7Days(knots);
    let streak = 0;
    for (let i = days.length - 1; i >= 0; i--) {
      if (days[i].count > 0) streak++;
      else break;
    }
    return streak;
  }

  countArchivedSplitsThisWeek(knots?: Knot[]): number {
    const list = knots ?? this.store.getKnots();
    const start = startOfWeekTsMonday();
    return list.filter(
      k => k.status === 'ARCHIVED' && k.archiveReason === 'SPLIT' && (k.archivedAt ?? k.updatedAt ?? 0) >= start
    ).length;
  }
}

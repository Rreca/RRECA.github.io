import { Injectable } from '@angular/core';
import { Platform } from '@ionic/angular/standalone';
import { StoreService } from './store.service';
import { GoalService } from './goal.service';
import { Knot } from '../models/knot.model';
import WidgetBridgePlugin, { WidgetData } from '../plugins/widget-bridge-plugin';

@Injectable({ providedIn: 'root' })
export class WidgetBridgeService {
  constructor(
    private store: StoreService,
    private goal: GoalService,
    private platform: Platform,
  ) {
    if (this.platform.is('android')) {
      this.store.knots$.subscribe(knots => this.pushWidgetData(knots));
    }
  }

  private pushWidgetData(knots: Knot[]): void {
    const currentKnot = knots.find(k => k.status === 'DOING') ?? null;
    const nextUnlockable = knots.find(k => k.status === 'UNLOCKABLE') ?? null;

    const data: WidgetData = {
      currentKnot: currentKnot ? {
        id: currentKnot.id,
        title: currentKnot.title,
        estMinutes: currentKnot.estMinutes ?? null,
        nextStep: currentKnot.nextStep ?? null,
      } : null,
      nextUnlockable: nextUnlockable ? {
        id: nextUnlockable.id,
        title: nextUnlockable.title,
      } : null,
      doneTodayCount: this.goal.countDoneToday(knots),
      dailyGoal: this.goal.getDailyGoal(),
    };

    WidgetBridgePlugin.updateWidgetData(data);
  }
}

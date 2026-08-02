import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  IonHeader, IonToolbar, IonTitle, IonContent, IonButton, IonButtons,
  ModalController,
} from '@ionic/angular/standalone';

import { Knot } from '../../models/knot.model';
import { StoreService } from '../../services/store.service';
import { formatTimeAgo, startOfWeekTsMonday } from '../../utils/utils';

const INTENTION_KEY = 'nudos_weekly_intention_v1';

@Component({
  selector: 'app-weekly-retro-modal',
  templateUrl: './weekly-retro-modal.component.html',
  styleUrls: ['./weekly-retro-modal.component.scss'],
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    IonHeader, IonToolbar, IonTitle, IonContent, IonButton, IonButtons,
  ],
})
export class WeeklyRetroModalComponent implements OnInit {

  doneThisWeek = 0;
  hardestDone: Knot | null = null;
  mostAvoided: Knot | null = null;
  mostAvoidedAge = '';
  weeklyIntention = '';

  constructor(
    private store: StoreService,
    private modal: ModalController,
  ) {}

  ngOnInit(): void {
    this.compute();
    this.weeklyIntention = localStorage.getItem(INTENTION_KEY) ?? '';
  }

  private compute(): void {
    const knots = this.store.getKnots();
    const weekStart = startOfWeekTsMonday();

    // Done this week
    const doneThisWeekKnots = knots.filter(k => {
      if (k.status !== 'DONE') return false;
      const ts = k.doneAt ?? k.updatedAt ?? 0;
      return ts >= weekStart;
    });
    this.doneThisWeek = doneThisWeekKnots.length;

    // Hardest done (highest friction)
    if (doneThisWeekKnots.length) {
      this.hardestDone = doneThisWeekKnots.reduce((max, k) =>
        k.weight > max.weight ? k : max, doneThisWeekKnots[0]);
    }

    // Most avoided: oldest UNLOCKABLE by lastTouchedAt that hasn't been completed
    const unlockables = knots.filter(k => k.status === 'UNLOCKABLE');
    if (unlockables.length) {
      this.mostAvoided = unlockables.reduce((oldest, k) => {
        const tsA = oldest.lastTouchedAt ?? oldest.createdAt ?? Infinity;
        const tsB = k.lastTouchedAt ?? k.createdAt ?? Infinity;
        return tsB < tsA ? k : oldest;
      }, unlockables[0]);
      this.mostAvoidedAge = formatTimeAgo(this.mostAvoided.lastTouchedAt ?? this.mostAvoided.createdAt);
    }
  }

  saveIntention(): void {
    localStorage.setItem(INTENTION_KEY, this.weeklyIntention);
  }

  dismiss(): void {
    this.saveIntention();
    this.modal.dismiss();
  }
}

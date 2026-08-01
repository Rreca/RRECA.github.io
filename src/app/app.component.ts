import { Component, OnInit } from '@angular/core';
import { IonApp, IonRouterOutlet } from '@ionic/angular/standalone';
import { Router } from '@angular/router';
import { NotificationService } from './services/notification.service';
import { WidgetBridgeService } from './services/widget-bridge.service';
import { TimerService } from './services/timer.service';
import { RulesService } from './services/rules.service';
import { LocalNotifications } from '@capacitor/local-notifications';

@Component({
  selector: 'app-root',
  template: `
    <ion-app>
      <ion-router-outlet></ion-router-outlet>
    </ion-app>
  `,
  standalone: true,
  imports: [IonApp, IonRouterOutlet],
})
export class AppComponent implements OnInit {
  constructor(
    private notif: NotificationService,
    private router: Router,
    private _widgetBridge: WidgetBridgeService,
    private timer: TimerService,
    private rules: RulesService,
  ) {}

  async ngOnInit(): Promise<void> {
    this.notif.recordAppOpen();
    await this.notif.cancelToday();

    // Recycle recurring knots that are due
    this.rules.recycleRecurringKnots();

    // Escuchar tap en notificaciones → abrir la app en la pantalla correcta
    LocalNotifications.addListener('localNotificationActionPerformed', (action) => {
      const actionId = action.actionId;

      if (actionId === 'quick_start_timer') {
        // Start timer with first available knot without opening app UI
        const knot = this.notif.getQuickStartKnot();
        if (knot) {
          const minutes = knot.estMinutes && knot.estMinutes > 0 ? knot.estMinutes : 5;
          this.timer.start(knot.id, minutes);
        }
        return;
      }

      // Default: navigate to today
      this.router.navigateByUrl('/today');
    });

    // Pedir permiso después de 1.5s para que la UI cargue visualmente primero
    setTimeout(async () => {
      const granted = await this.notif.requestPermission();
      if (granted) {
        await this.notif.scheduleAll();
      }
    }, 1500);
  }
}

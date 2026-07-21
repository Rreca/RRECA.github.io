import { Component, OnInit } from '@angular/core';
import { IonApp, IonRouterOutlet } from '@ionic/angular/standalone';
import { Router } from '@angular/router';
import { NotificationService } from './services/notification.service';
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
  ) {}

  async ngOnInit(): Promise<void> {
    this.notif.recordAppOpen();
    await this.notif.cancelToday();

    // Escuchar tap en notificaciones → abrir la app en la pantalla correcta
    LocalNotifications.addListener('localNotificationActionPerformed', (action) => {
      // Navegar a hoy por default al tocar cualquier notificación
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

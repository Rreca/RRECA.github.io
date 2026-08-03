import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  IonHeader, IonToolbar, IonTitle, IonContent, IonButton, IonButtons,
  IonToggle, IonItem, IonLabel, ModalController, AlertController,
} from '@ionic/angular/standalone';

import { NotificationService, NotificationSettings } from '../../services/notification.service';

@Component({
  selector: 'app-notifications-settings-modal',
  templateUrl: './notifications-settings-modal.component.html',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    IonHeader, IonToolbar, IonTitle, IonContent, IonButton, IonButtons,
    IonToggle, IonItem, IonLabel,
  ],
})
export class NotificationsSettingsModalComponent implements OnInit {
  settings!: NotificationSettings;
  hasPermission = false;
  permissionChecked = false;

  morningTime = '09:00';
  streakTime  = '22:00';

  constructor(
    private modal: ModalController,
    private alert: AlertController,
    private notif: NotificationService,
  ) {}

  async ngOnInit(): Promise<void> {
    this.settings = this.notif.getSettings();
    this.morningTime = this.pad(this.settings.morningHour) + ':' + this.pad(this.settings.morningMinute);
    this.streakTime  = this.pad(this.settings.streakHour)  + ':' + this.pad(this.settings.streakMinute);
    this.hasPermission = await this.notif.hasPermission();
    this.permissionChecked = true;
  }

  private pad(n: number): string { return String(n).padStart(2, '0'); }

  async requestPermission(): Promise<void> {
    const granted = await this.notif.requestPermission();
    this.hasPermission = granted;
    if (!granted) {
      const a = await this.alert.create({
        header: 'Permiso denegado',
        message: 'Para activar notificaciones andá a Configuración → Apps → Nudos → Notificaciones.',
        buttons: ['OK'],
      });
      await a.present();
    }
  }

  onMorningTimeChange(): void {
    const [h, m] = this.morningTime.split(':').map(Number);
    this.settings.morningHour   = isNaN(h) ? 9 : Math.min(15, Math.max(6, h));
    this.settings.morningMinute = isNaN(m) ? 0 : m;
  }

  onStreakTimeChange(): void {
    const [h, m] = this.streakTime.split(':').map(Number);
    this.settings.streakHour   = isNaN(h) ? 22 : Math.min(23, Math.max(18, h));
    this.settings.streakMinute = isNaN(m) ? 0 : m;
  }

  increaseMax(): void {
    if (this.settings.maxPerDay < 5) this.settings.maxPerDay++;
  }

  decreaseMax(): void {
    if (this.settings.maxPerDay > 1) this.settings.maxPerDay--;
  }

  async save(): Promise<void> {
    this.onMorningTimeChange();
    this.onStreakTimeChange();
    this.notif.saveSettings(this.settings);
    await this.notif.scheduleAll();
    this.modal.dismiss(null, 'saved');
  }

  async openAlarmSettings(): Promise<void> {
    const a = await this.alert.create({
      header: 'Alarma exacta del timer',
      message: 'Para que el timer suene justo cuando termina:\n\n' +
        '1. Configuración → Apps → Nudos → Alarmas y recordatorios → Activar\n\n' +
        '2. Configuración → Batería → Nudos → Sin restricciones\n\n' +
        'Esto evita que Android demore o bloquee la alarma cuando la app está en segundo plano.',
      buttons: ['Entendido'],
    });
    await a.present();
  }

  dismiss(): void { this.modal.dismiss(); }
}

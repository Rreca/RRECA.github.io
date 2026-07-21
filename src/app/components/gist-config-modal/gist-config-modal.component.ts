import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  IonHeader, IonToolbar, IonTitle, IonContent, IonButton, IonButtons,
  ModalController,
} from '@ionic/angular/standalone';

import { GistSyncService } from '../../services/gist-sync.service';

@Component({
  selector: 'app-gist-config-modal',
  templateUrl: './gist-config-modal.component.html',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    IonHeader, IonToolbar, IonTitle, IonContent, IonButton, IonButtons,
  ],
})
export class GistConfigModalComponent implements OnInit {
  gistId = '';
  token = '';
  hasToken = false;

  constructor(
    private modal: ModalController,
    private gist: GistSyncService,
  ) {}

  ngOnInit(): void {
    this.gistId = this.gist.getGistId();
    this.hasToken = !!this.gist.getToken();
    this.token = this.hasToken ? '••••••••••' : '';
  }

  save(): void {
    if (this.gistId.trim()) this.gist.setGistId(this.gistId.trim());
    if (this.token.trim() && this.token !== '••••••••••') {
      this.gist.setToken(this.token.trim());
    }
    this.modal.dismiss(null, 'saved');
  }

  dismiss(): void {
    this.modal.dismiss(null, 'cancel');
  }
}

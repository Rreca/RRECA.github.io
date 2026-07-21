import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { StoreService } from './store.service';
import { Knot } from '../models/knot.model';

const GIST_KEYS = {
  token: 'nudos_gist_token_v1',
  gistId: 'nudos_gist_id_v1',
  filename: 'nudos.json',
};

interface GistFile {
  content?: string;
  raw_url?: string;
}

interface GistResponse {
  files: Record<string, GistFile>;
}

interface CloudPayload {
  version: number;
  updatedAt: number;
  knots: Knot[];
}

@Injectable({ providedIn: 'root' })
export class GistSyncService {
  constructor(private http: HttpClient, private store: StoreService) {}

  // ─── Config ──────────────────────────────────────────────────────────────

  getToken(): string {
    return (localStorage.getItem(GIST_KEYS.token) ?? '').trim();
  }

  setToken(t: string): void {
    localStorage.setItem(GIST_KEYS.token, t.trim());
  }

  getGistId(): string {
    return (localStorage.getItem(GIST_KEYS.gistId) ?? '').trim();
  }

  setGistId(id: string): void {
    localStorage.setItem(GIST_KEYS.gistId, id.trim());
  }

  isConfigured(): boolean {
    return !!this.getGistId() && !!this.getToken();
  }

  // ─── API helpers ─────────────────────────────────────────────────────────

  private headers(): HttpHeaders {
    const token = this.getToken();
    return new HttpHeaders({
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `token ${token}` } : {}),
    });
  }

  // ─── Load ────────────────────────────────────────────────────────────────

  async loadFromGist(): Promise<CloudPayload> {
    const gistId = this.getGistId();
    if (!gistId) throw new Error('Falta Gist ID.');

    const gist = await firstValueFrom(
      this.http.get<GistResponse>(`https://api.github.com/gists/${gistId}`, {
        headers: this.headers(),
      })
    );

    const file = gist?.files?.[GIST_KEYS.filename];
    if (!file) throw new Error(`No existe ${GIST_KEYS.filename} en ese Gist.`);

    let content = file.content;
    if (!content && file.raw_url) {
      content = await firstValueFrom(
        this.http.get(file.raw_url, { responseType: 'text' })
      );
    }

    return JSON.parse(content ?? '{}') as CloudPayload;
  }

  // ─── Save ────────────────────────────────────────────────────────────────

  async saveToGist(): Promise<CloudPayload> {
    const gistId = this.getGistId();
    if (!gistId) throw new Error('Falta Gist ID.');
    if (!this.getToken()) throw new Error('Falta Token (scope: gist).');

    const localPayload: CloudPayload = {
      version: 1,
      updatedAt: Date.now(),
      knots: this.store.getKnots(),
    };

    // Protección de conflicto: no pisar si el remoto es más nuevo
    try {
      const remote = await this.loadFromGist();
      if (remote.updatedAt && remote.updatedAt > localPayload.updatedAt) {
        throw new Error('Conflicto: lo remoto es más nuevo. Cargá primero desde Gist.');
      }
    } catch (e: unknown) {
      const msg = (e as Error)?.message ?? '';
      if (msg.startsWith('Conflicto')) throw e;
      // Si no se puede leer el remoto, continuamos
    }

    const patch = {
      files: {
        [GIST_KEYS.filename]: {
          content: JSON.stringify(localPayload, null, 2),
        },
      },
    };

    await firstValueFrom(
      this.http.patch<GistResponse>(
        `https://api.github.com/gists/${gistId}`,
        patch,
        { headers: this.headers() }
      )
    );

    return localPayload;
  }

  // ─── Apply ───────────────────────────────────────────────────────────────

  applyPayload(payload: CloudPayload): void {
    if (!payload || !Array.isArray(payload.knots)) {
      throw new Error('Payload inválido (knots).');
    }
    this.store.saveKnots(payload.knots);
  }
}

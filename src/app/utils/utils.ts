/** Genera un UUID simple (compatible con el original) */
export function generateUUID(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2);
}

/** Escapa HTML para prevenir XSS al insertar strings en templates */
export function escapeHTML(str: string | null | undefined): string {
  if (str == null) return '';
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

/** Formatea un timestamp como texto relativo en español */
export function formatTimeAgo(timestamp: number | null | undefined): string {
  if (!timestamp) return 'recién';
  const now = Date.now();
  let seconds = Math.floor((now - timestamp) / 1000);
  if (seconds < 0) seconds = 0;

  let interval = Math.floor(seconds / 31536000);
  if (interval >= 1) return `${interval} año(s) atrás`;

  interval = Math.floor(seconds / 2592000);
  if (interval >= 1) return `${interval} mes(es) atrás`;

  interval = Math.floor(seconds / 86400);
  if (interval >= 1) return `${interval} día(s) atrás`;

  interval = Math.floor(seconds / 3600);
  if (interval >= 1) return `${interval} hora(s) atrás`;

  interval = Math.floor(seconds / 60);
  if (interval >= 1) return `${interval} minuto(s) atrás`;

  return `${seconds} segundo(s) atrás`;
}

/** Clave del día YYYY-MM-DD para agrupar hechos */
export function dayKey(ts: number): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${da}`;
}

/** Etiqueta legible de fecha para mostrar en grupos */
export function dayLabel(key: string): string {
  const parts = key.split('-');
  const d = new Date(
    parseInt(parts[0], 10),
    parseInt(parts[1], 10) - 1,
    parseInt(parts[2], 10)
  );
  return d.toLocaleDateString('es-AR', { weekday: 'long', day: '2-digit', month: 'long' });
}

/** Inicio del día de hoy en ms */
export function startOfTodayTs(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Inicio del lunes de esta semana en ms */
export function startOfWeekTsMonday(): number {
  const d = new Date();
  const day = d.getDay();
  const diff = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

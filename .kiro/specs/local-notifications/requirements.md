
# Spec: Notificaciones locales anti-procrastinación

## Contexto

Nudos es una app de productividad anti-procrastinación. El mayor problema conductual es que el usuario solo abre la app cuando se acuerda — rompiendo el hábito diario. Las notificaciones locales resuelven esto creando recordatorios externos que actúan como disparadores de comportamiento (behavior triggers).

La app ya tiene: sistema de nudos con estados (DOING, UNLOCKABLE, BLOCKED, SOMEDAY, DONE, ARCHIVED), streak diario, meta mínima diaria configurable, contextos (HOME, WORK, STREET, ANY), y timer de foco.

## Objetivos

1. Recordar al usuario que tiene nudos accionables esperando
2. Proteger la racha diaria antes de que se corte
3. Celebrar cuando se cumple la meta del día
4. No ser intrusivo — el usuario controla todo

---

## Requerimientos

### R1 — Permiso y configuración inicial

**R1.1** Al primer arranque de la app (o desde Configuración), solicitar permiso de notificaciones usando `@capacitor/local-notifications`.

**R1.2** Si el permiso es denegado, mostrar un mensaje explicativo y un botón para ir a la configuración del sistema.

**R1.3** El usuario puede habilitar/deshabilitar notificaciones desde dentro de la app sin salir.

---

### R2 — Notificación matutina de arranque

**Cuándo:** Cada día a una hora configurable por el usuario (default: 9:00 AM)

**Condición:** Solo si hay al menos 1 nudo UNLOCKABLE o DOING

**Mensaje dinámico según estado:**
- 1 DOING activo → "Tenés algo en progreso. 5 minutos y lo cerrás."
- 2+ UNLOCKABLE → "Tenés {n} desbloqueables listos. Elegí uno y arrancá."
- 1 UNLOCKABLE → "Hay 1 cosa lista para hacer. ¿Arrancamos?"
- Sin DOING ni UNLOCKABLE pero hay BLOCKED/SOMEDAY → "Sistema en pausa. Desbloqueá algo para seguir."

**R2.1** La hora de la notificación matutina es configurable (rango 6:00 — 12:00).

**R2.2** Si el usuario ya abrió la app y cumplió la meta antes de la hora configurada, la notificación del día se cancela automáticamente.

---

### R3 — Notificación de protección de racha

**Cuándo:** 2 horas antes de medianoche (default: 22:00)

**Condición:** Solo si la meta del día NO está cumplida aún

**Mensaje:**
- Racha de 3+ días → "⚠ Tu racha de {n} días termina a medianoche. 1 cosa. 5 minutos."
- Racha de 1-2 días → "⚠ Mínimo del día pendiente. No lo dejes para mañana."
- Sin racha → "Hoy podés arrancar una racha. 1 cosa pequeña ahora."

**R3.1** Si el usuario cumple la meta después de recibir esta notificación, la notificación del día siguiente se ajusta para celebrar la racha actualizada.

---

### R4 — Notificación de celebración

**Cuándo:** Inmediatamente cuando se marca un nudo como DONE y se cumple la meta del día

**Condición:** Primera vez que se cumple la meta en ese día

**Mensaje:**
- Meta exacta (ej: hizo 1 de 1) → "✅ Mínimo cumplido. La cadena sigue. Racha: {n} días."
- Superó la meta → "🔥 {n} hechos hoy. Más de lo mínimo. Bien."

**R4.1** Esta notificación es opcional — el usuario puede desactivarla por separado de las otras.

---

### R5 — Notificación de sistema paralizado

**Cuándo:** Cada 24 horas

**Condición:** No se abrió la app en 48+ horas Y hay nudos activos

**Mensaje:** "Nudos te espera. Llevás {n} días sin avanzar. 1 cosa, ahora."

**R5.1** Se cancela automáticamente si el usuario abre la app.

**R5.2** Máximo una notificación de este tipo por día para no ser spam.

---

### R6 — Panel de configuración de notificaciones

Una sección nueva en la pantalla de Análisis (o modal separado) con:

| Configuración | Tipo | Default |
|---|---|---|
| Notificaciones activadas | Toggle global | ON |
| Hora de recordatorio matutino | Time picker | 09:00 |
| Hora de protección de racha | Time picker | 22:00 |
| Notificación de celebración | Toggle | ON |
| Notificación de sistema paralizado | Toggle | ON |

**R6.1** El panel muestra el estado actual de permisos del sistema.

**R6.2** Los cambios se aplican inmediatamente — reprograman todas las notificaciones activas.

---

### R7 — Cancelación inteligente

**R7.1** Al abrir la app, cancelar todas las notificaciones pendientes del día actual (ya está despierto, no hace falta recordarle).

**R7.2** Al cumplir la meta, cancelar la notificación de protección de racha del mismo día.

**R7.3** Al no tener nudos activos (lista vacía), suspender todas las notificaciones hasta que se capture uno nuevo.

---

## Diseño técnico

### Stack
- Plugin: `@capacitor/local-notifications` v6+
- Servicio nuevo: `NotificationService` en `src/app/services/notification.service.ts`
- Configuración persistida en `localStorage` con prefijo `nudos_notif_`

### NotificationService — métodos principales

```typescript
requestPermission(): Promise<boolean>
scheduleAll(): Promise<void>          // reprograma todo desde cero
cancelAll(): Promise<void>
cancelToday(): Promise<void>          // cancela las del día actual
scheduleMorning(): Promise<void>
scheduleStreakProtection(): Promise<void>
scheduleCelebration(): Promise<void>
scheduleInactivityReminder(): Promise<void>
getSettings(): NotificationSettings
saveSettings(s: Partial<NotificationSettings>): void
```

### NotificationSettings

```typescript
interface NotificationSettings {
  enabled: boolean;
  morningHour: number;        // 6-12, default 9
  morningMinute: number;      // default 0
  streakHour: number;         // default 22
  streakMinute: number;       // default 0
  celebrationEnabled: boolean;
  inactivityEnabled: boolean;
}
```

### IDs de notificaciones

| ID | Tipo |
|---|---|
| 1001 | Matutina |
| 1002 | Protección de racha |
| 1003 | Celebración |
| 1004 | Sistema paralizado |

### Integración con app existente

- `AppComponent.ngOnInit()` → llamar `notif.cancelToday()` + `notif.scheduleAll()`
- `RulesService.transitionToDone()` → llamar `notif.scheduleCelebration()` si meta cumplida
- `StoreService.createKnot()` → si era lista vacía, llamar `notif.scheduleAll()`

---

## Criterios de aceptación

- [ ] El usuario puede activar/desactivar notificaciones desde la app
- [ ] La notificación matutina aparece a la hora configurada con mensaje dinámico correcto
- [ ] La notificación de racha NO aparece si la meta ya está cumplida
- [ ] La notificación de celebración aparece al completar la meta del día
- [ ] Abrir la app cancela las notificaciones del día
- [ ] Sin permisos, la app funciona igual sin errores
- [ ] Todas las notificaciones se cancelan si no hay nudos activos
- [ ] Los settings persisten entre sesiones

---

## Notas de psicología aplicada

- **Timing matutino**: las notificaciones a primera hora del día tienen 3x más engagement que las vespertinas. El usuario está en modo "planning", no en modo "apagar incendios".
- **Protección de racha**: el efecto de aversión a la pérdida (loss aversion) hace que "perder una racha" sea más motivador que "ganar un día". El mensaje debe enmarcar la notificación como proteger algo, no como recordar algo.
- **Celebración**: el refuerzo positivo inmediato después del comportamiento deseado es el mecanismo más efectivo para construir hábitos (Skinner). La notificación de celebración cierra el loop.
- **No spam**: más de 2 notificaciones por día destruye el hábito. El sistema está diseñado para un máximo de 2 notificaciones diarias en condiciones normales.

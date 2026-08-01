# capacitor-foreground-timer

Un plugin de Capacitor que provee un timer de cuenta regresiva confiable usando un Android Foreground Service. El timer sigue corriendo con precisión incluso cuando la app está en segundo plano, la pantalla está apagada, o el dispositivo entra en modo Doze.

## Características

- Foreground Service nativo de Android con `CountDownTimer`
- Notificación persistente con cuenta regresiva en vivo (MM:SS)
- Botón "Cancel" directamente desde la notificación
- Sonido chime personalizado + vibración al completarse (vía canal de notificación)
- Notificación de completación con resumen de la sesión
- Eventos emitidos a JavaScript: `timerFinished`, `timerCancelled`
- Inmune al modo Doze y la optimización de batería
- Sin dependencia de `MediaPlayer` — el sonido lo maneja el canal de notificación

## Requisitos

- Capacitor 5+
- Android SDK 26+ (Android 8.0 Oreo)
- Para Android 14+: permiso `FOREGROUND_SERVICE_MEDIA_PLAYBACK`

## Instalación

Este es un **plugin local** (no publicado en npm). Copiá los archivos fuente a tu proyecto Capacitor Android.

### 1. Copiar la interfaz TypeScript

Copiá `src/timer-plugin.ts` a tu proyecto (ej: `src/app/plugins/timer-plugin.ts`).

### 2. Copiar los archivos Java

Copiá todos los archivos de `android/` a tu proyecto Android en `android/app/src/main/java/TU_PAQUETE/`:

- `TimerPlugin.java`
- `TimerForegroundService.java`
- `TimerCancelReceiver.java`

> **Importante:** Actualizá la declaración `package` en cada archivo Java para que coincida con el paquete de tu app.

### 3. Copiar el recurso de audio

Copiá el archivo WAV de `android/res/raw/` a `android/app/src/main/res/raw/`:

- `timer_complete_chime.wav` — chime de 3 notas (C5→E5→G5) reproducido por el canal de notificación de completación

### 4. Actualizar AndroidManifest.xml

Agregá los siguientes permisos:

```xml
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK" />
<uses-permission android:name="android.permission.VIBRATE" />
```

Declarar el servicio y receiver dentro de `<application>`:

```xml
<service
    android:name=".TimerForegroundService"
    android:foregroundServiceType="mediaPlayback"
    android:exported="false" />

<receiver
    android:name=".TimerCancelReceiver"
    android:exported="false" />
```

### 5. Registrar el plugin en MainActivity

```java
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(TimerPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
```

## Uso

```typescript
import TimerPlugin from './plugins/timer-plugin';

// Iniciar un timer de 5 minutos
await TimerPlugin.start({ seconds: 300, title: 'Sesión de enfoque' });

// Detener el timer
await TimerPlugin.stop();

// Escuchar cuando termina
TimerPlugin.addListener('timerFinished', (event) => {
  console.log(`Timer terminó! Transcurrido: ${event.elapsedSeconds}s, Título: ${event.title}`);
});

// Escuchar cancelación (desde el botón de la notificación)
TimerPlugin.addListener('timerCancelled', (event) => {
  console.log(`Timer cancelado. Restante: ${event.remainingSeconds}s`);
});
```

## API

### `start(options: TimerPluginStartOptions): Promise<void>`

Inicia el timer con el foreground service.

| Parámetro | Tipo | Requerido | Default | Descripción |
|-----------|------|-----------|---------|-------------|
| `seconds` | `number` | Sí | — | Duración en segundos (debe ser > 0) |
| `title` | `string` | No | `"Timer"` | Título mostrado en la notificación |

- Rechaza si `seconds <= 0`
- Si ya hay un timer corriendo, lo detiene antes de iniciar el nuevo

### `stop(): Promise<void>`

Detiene el timer, cancela la cuenta regresiva y remueve la notificación.

### Eventos

| Evento | Payload | Descripción |
|--------|---------|-------------|
| `timerFinished` | `{ elapsedSeconds: number, title: string }` | El timer llegó a cero |
| `timerCancelled` | `{ remainingSeconds: number }` | El usuario canceló desde la notificación |

## Cómo funciona el sonido

El plugin usa **dos canales de notificación**:

| Canal | Propósito | Sonido |
|-------|-----------|--------|
| `foreground_timer` | Cuenta regresiva (notificación persistente) | Silencioso |
| `foreground_timer_completion` | Notificación de completación | `timer_complete_chime.wav` + vibración |

Cuando el timer termina, la notificación de completación se postea en el canal `foreground_timer_completion`, que tiene el sonido custom y el patrón de vibración asignados. Android maneja la reproducción automáticamente — no se necesita `MediaPlayer`.

> **Nota:** Si el usuario ya tiene la app instalada, puede necesitar desinstalar y reinstalar para que Android registre canales nuevos. Android cachea la configuración de canales.

## Arquitectura

```
┌─────────────────────────────────────────────┐
│  TypeScript (WebView)                       │
│  TimerPlugin.start() / stop()               │
│  addListener('timerFinished' | 'timerCancelled') │
└─────────────┬───────────────────────────────┘
              │ Capacitor Bridge
┌─────────────▼───────────────────────────────┐
│  TimerPlugin.java (@CapacitorPlugin)        │
│  Valida input, inicia/detiene servicio      │
│  Reenvía eventos via notifyListeners()      │
└─────────────┬───────────────────────────────┘
              │ startForegroundService()
┌─────────────▼───────────────────────────────┐
│  TimerForegroundService.java                │
│  CountDownTimer + Canales de notificación   │
│  Al terminar → postea notif de completación │
└─────────────────────────────────────────────┘
```

## Personalización

### Sonido custom

Reemplazá `android/res/raw/timer_complete_chime.wav` con tu propio archivo WAV/OGG. Mantené el mismo nombre de archivo o actualizá el identificador de recurso en `TimerForegroundService.java`.

### Patrón de vibración

Editá la llamada `setVibrationPattern` en `createNotificationChannels()`:

```java
completionChannel.setVibrationPattern(new long[]{ 0, 100, 80, 100, 80, 300 });
// Patrón: {delay, vibrar, pausa, vibrar, pausa, vibrar}
```

### Texto de notificaciones

El plugin usa inglés por defecto. Para traducir, cambiá los strings en `TimerForegroundService.java`:
- `"remaining"` → texto de la notificación de cuenta regresiva
- `"Cancel"` → etiqueta del botón cancelar
- `"⏰ Timer finished"` → título de notificación de completación
- `"Session of %s — %s"` → cuerpo de notificación de completación

## Licencia

MIT

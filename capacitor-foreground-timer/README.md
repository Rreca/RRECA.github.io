# capacitor-foreground-timer

A Capacitor plugin that provides a reliable countdown timer using an Android Foreground Service. The timer continues running accurately even when the app is in the background, the screen is off, or the device enters Doze mode.

## Features

- Native Android Foreground Service with `CountDownTimer`
- Persistent notification with live MM:SS countdown
- Cancel button directly from the notification
- Custom chime sound + vibration on completion (via notification channel)
- Completion notification with session summary
- Events emitted to JavaScript: `timerFinished`, `timerCancelled`
- Immune to Doze mode and battery optimization
- No `MediaPlayer` dependency — sound is handled by the notification channel

## Requirements

- Capacitor 5+
- Android SDK 26+ (Android 8.0 Oreo)
- For Android 14+: `FOREGROUND_SERVICE_MEDIA_PLAYBACK` permission

## Installation

This is a **local plugin** (not published to npm). Copy the source files into your Capacitor Android project.

### 1. Copy TypeScript interface

Copy `src/timer-plugin.ts` into your project (e.g., `src/app/plugins/timer-plugin.ts`).

### 2. Copy Java files

Copy all files from `android/` into your Android project at `android/app/src/main/java/YOUR_PACKAGE/`:

- `TimerPlugin.java`
- `TimerForegroundService.java`
- `TimerCancelReceiver.java`

> **Important:** Update the `package` declaration in each Java file to match your app's package name.

### 3. Copy audio resource

Copy the WAV file from `android/res/raw/` to `android/app/src/main/res/raw/`:

- `timer_complete_chime.wav` — 3-note chime (C5→E5→G5) played by the completion notification channel

### 4. Update AndroidManifest.xml

Add the following permissions:

```xml
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK" />
<uses-permission android:name="android.permission.VIBRATE" />
```

Declare the service and receiver inside `<application>`:

```xml
<service
    android:name=".TimerForegroundService"
    android:foregroundServiceType="mediaPlayback"
    android:exported="false" />

<receiver
    android:name=".TimerCancelReceiver"
    android:exported="false" />
```

### 5. Register the plugin in MainActivity

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

## Usage

```typescript
import TimerPlugin from './plugins/timer-plugin';

// Start a 5-minute timer
await TimerPlugin.start({ seconds: 300, title: 'Focus Session' });

// Stop the timer
await TimerPlugin.stop();

// Listen for completion
TimerPlugin.addListener('timerFinished', (event) => {
  console.log(`Timer finished! Elapsed: ${event.elapsedSeconds}s, Title: ${event.title}`);
});

// Listen for cancellation (from notification button)
TimerPlugin.addListener('timerCancelled', (event) => {
  console.log(`Timer cancelled. Remaining: ${event.remainingSeconds}s`);
});
```

## API

### `start(options: TimerPluginStartOptions): Promise<void>`

Starts the foreground service timer.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `seconds` | `number` | Yes | — | Duration in seconds (must be > 0) |
| `title` | `string` | No | `"Timer"` | Title shown in the notification |

- Rejects if `seconds <= 0`
- If a timer is already running, it stops the existing one first

### `stop(): Promise<void>`

Stops the running timer, cancels the countdown, and removes the notification.

### Events

| Event | Payload | Description |
|-------|---------|-------------|
| `timerFinished` | `{ elapsedSeconds: number, title: string }` | Timer reached zero |
| `timerCancelled` | `{ remainingSeconds: number }` | User cancelled from notification |

## How Sound Works

The plugin uses **two notification channels**:

| Channel | Purpose | Sound |
|---------|---------|-------|
| `foreground_timer` | Ongoing countdown (persistent notification) | Silent |
| `foreground_timer_completion` | Completion notification | `timer_complete_chime.wav` + vibration |

When the timer finishes, the completion notification is posted to the `foreground_timer_completion` channel, which has the custom sound and vibration pattern assigned. Android handles playback automatically — no `MediaPlayer` needed.

> **Note:** If the user has already installed your app, they may need to uninstall and reinstall for Android to register new notification channels. Android caches channel settings.

## Architecture

```
┌─────────────────────────────────────────────┐
│  TypeScript (WebView)                       │
│  TimerPlugin.start() / stop()               │
│  addListener('timerFinished' | 'timerCancelled') │
└─────────────┬───────────────────────────────┘
              │ Capacitor Bridge
┌─────────────▼───────────────────────────────┐
│  TimerPlugin.java (@CapacitorPlugin)        │
│  Validates input, starts/stops service      │
│  Relays events via notifyListeners()        │
└─────────────┬───────────────────────────────┘
              │ startForegroundService()
┌─────────────▼───────────────────────────────┐
│  TimerForegroundService.java                │
│  CountDownTimer + Notification channels     │
│  On finish → posts completion notification  │
└─────────────────────────────────────────────┘
```

## Customization

### Custom sound

Replace `android/res/raw/timer_complete_chime.wav` with your own WAV/OGG file. Keep the same filename or update the resource identifier in `TimerForegroundService.java`.

### Vibration pattern

Edit the `setVibrationPattern` call in `createNotificationChannels()`:

```java
completionChannel.setVibrationPattern(new long[]{ 0, 100, 80, 100, 80, 300 });
// Pattern: {delay, vibrate, pause, vibrate, pause, vibrate}
```

### Notification text

The plugin uses English by default. To localize, change the strings in `TimerForegroundService.java`:
- `"remaining"` → countdown notification text
- `"Cancel"` → cancel button label
- `"⏰ Timer finished"` → completion notification title
- `"Session of %s — %s"` → completion notification body

## License

MIT

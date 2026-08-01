# Design Document: Timer Foreground Service

## Overview

This design describes a custom local Capacitor plugin (`TimerPlugin`) that wraps an Android Foreground Service (`TimerForegroundService`) to provide a reliable countdown timer immune to Doze mode and app suspension. The plugin replaces the current `@capacitor/local-notifications`-based timer alarm with a native service that maintains its own `CountDownTimer`, updates a persistent notification every second, and triggers sound + vibration exactly when the countdown reaches zero.

The architecture follows a three-layer approach:
1. **TypeScript Plugin Interface** — typed API registered via `@capacitor/core`'s `registerPlugin`
2. **Capacitor Plugin Bridge** (Java) — `@CapacitorPlugin` class that validates inputs, starts/stops the service, and relays events back to the WebView
3. **Android Foreground Service** (Java) — standalone `Service` with `CountDownTimer`, notification management, and alarm playback

### Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| Local plugin (not npm package) | Single-app use; avoids publish overhead; co-located in `android/` source tree |
| `CountDownTimer` over `Handler`/`AlarmManager` | Simpler API for fixed countdown; runs on main thread which is fine for 1-second ticks; automatically handles interval+finish callbacks |
| `foregroundServiceType="mediaPlayback"` | Required on Android 14+ to play audio from a foreground service; the alarm sound qualifies as media playback |
| Separate notification channel | Distinct from existing `nudos_default` channel; importance HIGH ensures heads-up display |
| BroadcastReceiver for cancel action | Standard Android pattern for notification action buttons; decouples cancel intent from activity lifecycle |

## Architecture

```mermaid
graph TD
    subgraph WebView ["WebView (Angular)"]
        TS[TimerService]
        PI[TimerPlugin Interface]
    end

    subgraph CapBridge ["Capacitor Bridge"]
        CP[TimerPlugin.java<br/>@CapacitorPlugin]
    end

    subgraph NativeAndroid ["Android Native"]
        FS[TimerForegroundService]
        CDT[CountDownTimer]
        NM[NotificationManager]
        MP[MediaPlayer]
        VB[Vibrator]
        BR[TimerCancelReceiver<br/>BroadcastReceiver]
    end

    TS -->|"start(seconds, title)"| PI
    TS -->|"stop()"| PI
    PI -->|"bridge call"| CP
    CP -->|"startService(Intent)"| FS
    CP -->|"stopService()"| FS
    FS -->|"CountDownTimer"| CDT
    CDT -->|"onTick()"| NM
    CDT -->|"onFinish()"| MP
    CDT -->|"onFinish()"| VB
    CDT -->|"onFinish()"| NM
    FS -->|"timerFinished event"| CP
    CP -->|"notifyListeners()"| PI
    PI -->|"event callback"| TS
    BR -->|"cancel intent"| FS
    FS -->|"timerCancelled event"| CP
```

### Data Flow

1. **Start**: `TimerService.start(knotId, minutes)` → `TimerPlugin.start({ seconds, title })` → `TimerPlugin.java.start(PluginCall)` → validates → `context.startForegroundService(intent)` → `TimerForegroundService.onStartCommand()` → creates `CountDownTimer(milliseconds, 1000)`
2. **Tick**: `CountDownTimer.onTick(millisUntilFinished)` → updates notification text with MM:SS
3. **Finish**: `CountDownTimer.onFinish()` → plays `timer_done.wav` via `MediaPlayer` → vibrates → posts completion notification → calls `TimerPlugin.fireTimerFinished()` → `notifyListeners("timerFinished", data)` → TimerService callback updates state
4. **Cancel (from notification)**: User taps "Cancelar" → `PendingIntent` fires → `TimerCancelReceiver.onReceive()` → sends stop intent to `TimerForegroundService` → service stops → `TimerPlugin.fireTimerCancelled()` → `notifyListeners("timerCancelled", data)`
5. **Stop (from JS)**: `TimerPlugin.stop()` → `context.stopService(intent)` → `TimerForegroundService.onDestroy()` → cancels `CountDownTimer`, removes notification

## Components and Interfaces

### 1. TypeScript Plugin Definition

**File:** `src/app/plugins/timer-plugin.ts`

```typescript
import { registerPlugin } from '@capacitor/core';

export interface TimerPluginStartOptions {
  seconds: number;
  title?: string;
}

export interface TimerFinishedEvent {
  elapsedSeconds: number;
  title: string;
}

export interface TimerCancelledEvent {
  remainingSeconds: number;
}

export interface TimerPluginInterface {
  start(options: TimerPluginStartOptions): Promise<void>;
  stop(): Promise<void>;
  addListener(
    eventName: 'timerFinished',
    callback: (event: TimerFinishedEvent) => void
  ): Promise<{ remove: () => Promise<void> }>;
  addListener(
    eventName: 'timerCancelled',
    callback: (event: TimerCancelledEvent) => void
  ): Promise<{ remove: () => Promise<void> }>;
}

const TimerPlugin = registerPlugin<TimerPluginInterface>('TimerPlugin');
export default TimerPlugin;
```

### 2. Capacitor Plugin Bridge (Java)

**File:** `android/app/src/main/java/com/nudos/app/TimerPlugin.java`

```java
package com.nudos.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import android.content.Intent;

@CapacitorPlugin(name = "TimerPlugin")
public class TimerPlugin extends Plugin {

    @PluginMethod()
    public void start(PluginCall call) {
        int seconds = call.getInt("seconds", 0);
        String title = call.getString("title", "Timer de enfoque");

        if (seconds <= 0) {
            call.reject("Invalid duration: seconds must be greater than zero");
            return;
        }

        // Stop any existing timer first
        stopService();

        // Start foreground service
        Intent intent = new Intent(getContext(), TimerForegroundService.class);
        intent.putExtra("seconds", seconds);
        intent.putExtra("title", title);
        getContext().startForegroundService(intent);

        call.resolve();
    }

    @PluginMethod()
    public void stop(PluginCall call) {
        stopService();
        call.resolve();
    }

    private void stopService() {
        Intent intent = new Intent(getContext(), TimerForegroundService.class);
        getContext().stopService(intent);
    }

    // Called from TimerForegroundService via static reference
    public void fireTimerFinished(int elapsedSeconds, String title) {
        JSObject data = new JSObject();
        data.put("elapsedSeconds", elapsedSeconds);
        data.put("title", title);
        notifyListeners("timerFinished", data);
    }

    public void fireTimerCancelled(int remainingSeconds) {
        JSObject data = new JSObject();
        data.put("remainingSeconds", remainingSeconds);
        notifyListeners("timerCancelled", data);
    }
}
```

### 3. Android Foreground Service

**File:** `android/app/src/main/java/com/nudos/app/TimerForegroundService.java`

Responsibilities:
- Creates notification channel on first start
- Starts `CountDownTimer` with provided seconds
- Updates notification every tick (1 second)
- On finish: plays sound, vibrates, posts completion notification, notifies plugin
- On cancel (via BroadcastReceiver): cancels timer, stops self, notifies plugin
- Holds a static reference to the plugin instance for event delivery

### 4. BroadcastReceiver for Cancel Action

**File:** `android/app/src/main/java/com/nudos/app/TimerCancelReceiver.java`

Receives the "cancel" PendingIntent from the notification action button and sends a stop intent to `TimerForegroundService`.

### 5. Updated TimerService (Angular)

**File:** `src/app/services/timer.service.ts`

Changes:
- Import `TimerPlugin` from the plugin definition
- In `start()`: call `TimerPlugin.start({ seconds: minutes * 60, title })` instead of `this.notif.scheduleTimerAlarm()`
- In `stop()`: call `TimerPlugin.stop()` instead of `this.notif.cancelTimerAlarm()`
- Register `timerFinished` listener in constructor to update state on native completion
- Register `timerCancelled` listener to handle cancel-from-notification
- Remove the in-WebView `interval(300)` tick subscription (native handles countdown)
- Keep `formatTime()` and `timerClass()` utility methods (used by UI)
- Keep `state$` observable (UI still subscribes to it)

### 6. Updated FocusTimerModalComponent

**File:** `src/app/components/focus-timer-modal/focus-timer-modal.component.ts`

Changes:
- In `onTimerFinished()`: suppress `playBeep()` entirely since native alarm handles sound
- Remove the `document.visibilityState` check (no longer needed — native always plays)
- Keep vibration feedback for the `markDone()` celebration flow (separate from timer alarm)

### 7. Updated NotificationService

**File:** `src/app/services/notification.service.ts`

Removals:
- `alarmChannelCreated` property
- `ensureAlarmChannel()` method
- `scheduleTimerAlarm()` method
- `cancelTimerAlarm()` method
- `NOTIF_IDS.TIMER_ALARM` constant

All other notification methods remain unchanged.

## Data Models

### Plugin Call Parameters

| Method | Parameter | Type | Required | Default |
|--------|-----------|------|----------|---------|
| `start` | `seconds` | `number` | Yes | — |
| `start` | `title` | `string` | No | `"Timer de enfoque"` |
| `stop` | — | — | — | — |

### Events Emitted (Native → JS)

| Event | Payload | Description |
|-------|---------|-------------|
| `timerFinished` | `{ elapsedSeconds: number, title: string }` | Timer completed naturally |
| `timerCancelled` | `{ remainingSeconds: number }` | User cancelled from notification |

### Intent Extras (Java)

| Key | Type | Description |
|-----|------|-------------|
| `seconds` | `int` | Total countdown duration |
| `title` | `String` | Notification title to display |

### Notification Channel

| Property | Value |
|----------|-------|
| ID | `nudos_timer_foreground` |
| Name | `Timer de Enfoque` |
| Description | `Notificación activa durante el timer de enfoque` |
| Importance | `IMPORTANCE_HIGH` (4) |
| Sound | none (ongoing notification is silent; alarm sound is played programmatically) |
| Vibration | false (vibration triggered programmatically on finish) |

### Vibration Pattern

```java
long[] pattern = { 0, 100, 80, 100, 80, 300 };
// 0ms delay, 100ms on, 80ms off, 100ms on, 80ms off, 300ms on
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Invalid duration rejection

*For any* number less than or equal to zero passed as `seconds` to `TimerPlugin.start()`, the returned Promise SHALL reject with an error message containing "Invalid duration".

**Validates: Requirements 1.4**

### Property 2: Time format is always MM:SS

*For any* integer seconds value in the range [0, 5999], the `formatTime(seconds)` function SHALL produce a string matching the pattern `^\d{2}:\d{2}$` where the first two digits represent minutes (00-99) and the last two represent seconds (00-59).

**Validates: Requirements 3.1**

### Property 3: Title defaults to "Timer de enfoque"

*For any* call to start the timer, if the `title` parameter is `undefined` or `null`, the notification SHALL display "Timer de enfoque"; otherwise it SHALL display the provided title string exactly as given.

**Validates: Requirements 3.3**

### Property 4: Completion notification body contains session info

*For any* completed timer session with a given total seconds and title, the completion notification body SHALL contain the formatted duration of the session and the title used.

**Validates: Requirements 5.3**

### Property 5: TimerService delegates with correct seconds conversion

*For any* positive integer `minutes` passed to `TimerService.start()`, the plugin SHALL be invoked with `seconds` equal to `minutes * 60`.

**Validates: Requirements 6.1**

## Error Handling

| Scenario | Handling |
|----------|----------|
| `start()` with `seconds <= 0` | Plugin rejects Promise with descriptive error; no service started |
| `start()` while timer running | Existing service stopped gracefully before new one starts |
| `stop()` when no timer running | No-op; Promise resolves immediately |
| Service killed by OS | Foreground services are rarely killed; if it happens, `onDestroy()` cleans up. No event emitted (timer silently fails) |
| Audio file missing (`timer_done.wav`) | `MediaPlayer` wrapped in try-catch; failure logged, vibration still triggers |
| Notification permission not granted | Foreground service still runs (notification is mandatory for foreground services on Android); the system may show a generic notification |
| `startForegroundService` timeout (ANR) | Service calls `startForeground()` within `onCreate()` immediately, well before the 5-second ANR limit |

## Testing Strategy

### Unit Tests (TypeScript)

- **TimerService delegation**: Mock `TimerPlugin`, verify `start()` calls plugin with correct `seconds` and `title`
- **TimerService stop delegation**: Mock `TimerPlugin`, verify `stop()` calls `TimerPlugin.stop()`
- **TimerService event handling**: Simulate `timerFinished` event, verify state updates to `{ running: false, secondsLeft: 0 }`
- **TimerService timerCancelled handling**: Simulate `timerCancelled` event, verify state updates
- **FocusTimerModalComponent**: Verify `playBeep()` is NOT called when `timerFinished` fires
- **formatTime()**: Verify edge cases (0 → "00:00", 59 → "00:59", 60 → "01:00", 3599 → "59:59")
- **NotificationService**: Verify `scheduleTimerAlarm`, `cancelTimerAlarm`, `ensureAlarmChannel` are removed (compilation check)

### Property-Based Tests (TypeScript — fast-check)

Library: [fast-check](https://github.com/dubzzz/fast-check)
Configuration: minimum 100 iterations per property.

- **Property 1**: Generate `fc.integer({ max: 0 })` and `fc.double({ max: 0 })`, verify plugin rejects
  - Tag: `Feature: timer-foreground-service, Property 1: Invalid duration rejection`
- **Property 2**: Generate `fc.integer({ min: 0, max: 5999 })`, verify `formatTime` output matches `^\d{2}:\d{2}$` and minutes/seconds decompose correctly
  - Tag: `Feature: timer-foreground-service, Property 2: Time format is always MM:SS`
- **Property 3**: Generate `fc.option(fc.string())` for title, verify result is provided title or "Timer de enfoque"
  - Tag: `Feature: timer-foreground-service, Property 3: Title defaults to "Timer de enfoque"`
- **Property 4**: Generate `fc.integer({ min: 1, max: 7200 })` for seconds and `fc.string({ minLength: 1 })` for title, verify completion body contains duration string and title
  - Tag: `Feature: timer-foreground-service, Property 4: Completion notification body contains session info`
- **Property 5**: Generate `fc.integer({ min: 1, max: 120 })` for minutes, verify plugin called with `minutes * 60`
  - Tag: `Feature: timer-foreground-service, Property 5: TimerService delegates with correct seconds conversion`

### Integration Tests (Android Instrumented)

- Start service → verify notification appears with correct channel and title
- Start service → wait → verify notification text updates (seconds decrement)
- Start service with short duration → wait → verify `timerFinished` event received
- Start service → tap "Cancelar" → verify service stops and `timerCancelled` event received
- Start service → call `stop()` → verify service stops cleanly
- Start service while another is running → verify first stops, second starts
- Verify `MediaPlayer` plays `timer_done.wav` on countdown completion
- Verify vibration pattern matches specification on completion

### Smoke / Configuration Tests

- AndroidManifest contains `FOREGROUND_SERVICE` permission
- AndroidManifest contains `FOREGROUND_SERVICE_MEDIA_PLAYBACK` permission
- AndroidManifest declares `TimerForegroundService` with `foregroundServiceType="mediaPlayback"`
- AndroidManifest declares `TimerCancelReceiver`
- Notification channel `nudos_timer_foreground` created with importance HIGH
- `res/raw/timer_done.wav` exists and is playable

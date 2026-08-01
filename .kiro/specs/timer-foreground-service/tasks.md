# Implementation Plan: Timer Foreground Service

## Overview

Replace the `@capacitor/local-notifications`-based timer alarm with a custom Capacitor plugin wrapping an Android Foreground Service. Implementation proceeds bottom-up: TypeScript plugin definition → Java bridge → native service → Angular integration → legacy cleanup → tests.

## Tasks

- [x] 1. Set up plugin definition and Android manifest
  - [x] 1.1 Create TypeScript plugin interface
    - Create `src/app/plugins/timer-plugin.ts`
    - Define `TimerPluginStartOptions`, `TimerFinishedEvent`, `TimerCancelledEvent` interfaces
    - Define `TimerPluginInterface` with `start()`, `stop()`, and `addListener()` overloads
    - Register the plugin via `registerPlugin<TimerPluginInterface>('TimerPlugin')`
    - Export default `TimerPlugin` instance
    - _Requirements: 1.1, 1.2, 1.3, 1.4_

  - [x] 1.2 Update AndroidManifest.xml with permissions and declarations
    - Add `android.permission.FOREGROUND_SERVICE` permission
    - Add `android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK` permission
    - Declare `TimerForegroundService` with `android:foregroundServiceType="mediaPlayback"`
    - Declare `TimerCancelReceiver` as a BroadcastReceiver
    - _Requirements: 8.1, 8.2, 8.3, 8.4_

- [x] 2. Implement native Android layer
  - [x] 2.1 Create TimerPlugin.java (Capacitor Plugin Bridge)
    - Create `android/app/src/main/java/com/nudos/app/TimerPlugin.java`
    - Annotate with `@CapacitorPlugin(name = "TimerPlugin")`
    - Implement `start(PluginCall)` — validate seconds > 0, stop existing service, start foreground service with extras
    - Implement `stop(PluginCall)` — stop the service, resolve
    - Implement `fireTimerFinished(int elapsedSeconds, String title)` — call `notifyListeners("timerFinished", data)`
    - Implement `fireTimerCancelled(int remainingSeconds)` — call `notifyListeners("timerCancelled", data)`
    - _Requirements: 1.1, 1.2, 1.4, 1.5_

  - [x] 2.2 Create TimerForegroundService.java
    - Create `android/app/src/main/java/com/nudos/app/TimerForegroundService.java`
    - Create notification channel `nudos_timer_foreground` with importance HIGH in `onCreate()`
    - In `onStartCommand()`: parse extras, create persistent notification with "Cancelar" action, call `startForeground()`, start `CountDownTimer`
    - In `onTick()`: update notification text with MM:SS format
    - In `onFinish()`: play `res/raw/timer_done.wav` via MediaPlayer, trigger vibration pattern, post completion notification, call `TimerPlugin.fireTimerFinished()`
    - In `onDestroy()`: cancel CountDownTimer, remove notification, release MediaPlayer
    - Hold static reference to TimerPlugin instance for event delivery
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 3.2, 3.3, 3.4, 5.1, 5.2, 5.3, 5.4_

  - [x] 2.3 Create TimerCancelReceiver.java
    - Create `android/app/src/main/java/com/nudos/app/TimerCancelReceiver.java`
    - Extend `BroadcastReceiver`
    - In `onReceive()`: send stop intent to `TimerForegroundService`
    - Trigger `TimerPlugin.fireTimerCancelled()` with remaining seconds
    - _Requirements: 4.1, 4.2, 4.3_

  - [x] 2.4 Add timer_done.wav audio resource
    - Place the alarm sound file at `android/app/src/main/res/raw/timer_done.wav`
    - Verify the file is a valid WAV or OGG playable by Android MediaPlayer
    - _Requirements: 5.1_

  - [x] 2.5 Register TimerPlugin in MainActivity
    - In `android/app/src/main/java/com/nudos/app/MainActivity.java`, register `TimerPlugin.class` in `onCreate()` via `registerPlugin(TimerPlugin.class)` (or via the Capacitor plugin auto-loading mechanism if available)
    - _Requirements: 1.1_

- [x] 3. Checkpoint - Verify native layer compiles
  - Ensure all Java files compile without errors, ask the user if questions arise.

- [x] 4. Integrate plugin into Angular services
  - [x] 4.1 Update TimerService to use TimerPlugin
    - In `src/app/services/timer.service.ts`, import `TimerPlugin` from `../plugins/timer-plugin`
    - In `start()`: call `TimerPlugin.start({ seconds: minutes * 60, title })` instead of `this.notif.scheduleTimerAlarm()`
    - In `stop()`: call `TimerPlugin.stop()` instead of `this.notif.cancelTimerAlarm()`
    - Register `timerFinished` listener in constructor/init — update `state$` to `{ running: false, secondsLeft: 0 }`
    - Register `timerCancelled` listener — update state to stopped
    - Remove the in-WebView `interval(300)` tick subscription (native handles countdown)
    - Keep `formatTime()`, `timerClass()`, and `state$` observable intact
    - _Requirements: 6.1, 6.2, 6.3_

  - [x] 4.2 Update FocusTimerModalComponent to suppress double audio
    - In `src/app/components/focus-timer-modal/focus-timer-modal.component.ts`
    - In `onTimerFinished()`: remove or guard `playBeep()` call so it does NOT play when native alarm fires
    - Remove `document.visibilityState` check (no longer needed)
    - Keep vibration feedback for `markDone()` celebration flow
    - _Requirements: 6.4_

  - [x] 4.3 Remove legacy timer alarm code from NotificationService
    - In `src/app/services/notification.service.ts`:
    - Remove `alarmChannelCreated` property
    - Remove `ensureAlarmChannel()` method
    - Remove `scheduleTimerAlarm()` method
    - Remove `cancelTimerAlarm()` method
    - Remove `NOTIF_IDS.TIMER_ALARM` constant (if isolated) or the timer alarm entry from the IDs object
    - Retain all other notification methods (morning, streak, celebration, inactivity, test)
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

- [x] 5. Checkpoint - Verify Angular build succeeds
  - Run `ng build` and ensure no compilation errors, ask the user if questions arise.

- [x] 6. Write unit tests for TypeScript layer
  - [x] 6.1 Write unit tests for TimerService plugin delegation
    - Create test file for TimerService (e.g., `src/app/services/timer.service.spec.ts`)
    - Mock `TimerPlugin` (start, stop, addListener)
    - Test: `start(5)` calls `TimerPlugin.start({ seconds: 300, title })` with correct conversion
    - Test: `stop()` calls `TimerPlugin.stop()`
    - Test: simulated `timerFinished` event updates state to `{ running: false, secondsLeft: 0 }`
    - Test: simulated `timerCancelled` event updates state to stopped
    - _Requirements: 6.1, 6.2, 6.3_

  - [ ]* 6.2 Write property test: TimerService delegates with correct seconds conversion
    - **Property 5: TimerService delegates with correct seconds conversion**
    - Generate `fc.integer({ min: 1, max: 120 })` for minutes
    - Verify plugin is called with `seconds === minutes * 60`
    - **Validates: Requirements 6.1**

  - [x] 6.3 Write unit tests for formatTime utility
    - Test edge cases: 0 → "00:00", 59 → "00:59", 60 → "01:00", 3599 → "59:59"
    - _Requirements: 3.1_

  - [ ]* 6.4 Write property test: Time format is always MM:SS
    - **Property 2: Time format is always MM:SS**
    - Generate `fc.integer({ min: 0, max: 5999 })`
    - Verify output matches `^\d{2}:\d{2}$`
    - Verify minutes = Math.floor(s/60), seconds = s % 60
    - **Validates: Requirements 3.1**

  - [ ]* 6.5 Write property test: Invalid duration rejection
    - **Property 1: Invalid duration rejection**
    - Generate `fc.integer({ max: 0 })` for seconds
    - Verify `TimerPlugin.start({ seconds })` rejects with error containing "Invalid duration"
    - **Validates: Requirements 1.4**

  - [ ]* 6.6 Write property test: Title defaults to "Timer de enfoque"
    - **Property 3: Title defaults to "Timer de enfoque"**
    - Generate `fc.option(fc.string())` for title
    - Verify: if title is undefined/null → notification uses "Timer de enfoque"; otherwise uses provided title
    - **Validates: Requirements 3.3**

  - [ ]* 6.7 Write property test: Completion notification body contains session info
    - **Property 4: Completion notification body contains session info**
    - Generate `fc.integer({ min: 1, max: 7200 })` for seconds, `fc.string({ minLength: 1 })` for title
    - Verify completion notification body contains formatted duration and title
    - **Validates: Requirements 5.3**

  - [x] 6.8 Write unit tests for FocusTimerModalComponent audio suppression
    - Verify `playBeep()` is NOT called when `timerFinished` fires
    - Verify vibration feedback for `markDone()` still works
    - _Requirements: 6.4_

- [x] 7. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The `timer_done.wav` audio file must be provided by the developer or sourced separately
- The build flow is `ng build` → `npx cap sync android` for full deployment verification

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "2.4"] },
    { "id": 1, "tasks": ["2.1", "2.3", "2.5"] },
    { "id": 2, "tasks": ["2.2"] },
    { "id": 3, "tasks": ["4.1", "4.3"] },
    { "id": 4, "tasks": ["4.2"] },
    { "id": 5, "tasks": ["6.1", "6.3", "6.8"] },
    { "id": 6, "tasks": ["6.2", "6.4", "6.5", "6.6", "6.7"] }
  ]
}
```

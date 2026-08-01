# Requirements Document

## Introduction

This feature replaces the current `@capacitor/local-notifications`-based timer alarm with a custom Capacitor plugin that wraps an Android Foreground Service. The Foreground Service maintains an accurate native countdown immune to Doze mode, battery optimization, and app suspension, guaranteeing that the alarm sound and vibration fire exactly when the timer reaches zero. The plugin exposes a JavaScript API for starting/stopping the timer and emits events back to the WebView when the timer completes.

## Glossary

- **TimerPlugin**: The custom Capacitor plugin class (Java) that bridges JavaScript calls to the native Android Foreground Service
- **TimerForegroundService**: The native Android Service that runs in the foreground, maintains the countdown, updates the persistent notification, and triggers sound/vibration at zero
- **Persistent_Notification**: The ongoing Android notification displayed while the Foreground Service is running, showing remaining time and a cancel action
- **Timer_Finished_Event**: The event emitted from the native layer to the JavaScript layer when the countdown reaches zero
- **TimerService**: The existing Angular service (`timer.service.ts`) that manages timer state via BehaviorSubject and coordinates start/stop logic
- **NotificationService**: The existing Angular service (`notification.service.ts`) that schedules local notifications for morning, streak, celebration, and inactivity reminders
- **Foreground_Service_Channel**: The Android notification channel (importance HIGH) used exclusively for the timer Foreground Service notifications

## Requirements

### Requirement 1: Plugin JavaScript Interface

**User Story:** As a developer, I want a typed Capacitor plugin interface for the timer, so that I can start and stop the native foreground service from TypeScript code.

#### Acceptance Criteria

1. THE TimerPlugin SHALL expose a `start(options: { seconds: number, title?: string })` method that returns a Promise resolving when the Foreground Service has started
2. THE TimerPlugin SHALL expose a `stop()` method that returns a Promise resolving when the Foreground Service has stopped
3. THE TimerPlugin SHALL expose an `addListener('timerFinished', callback)` method that registers a callback invoked when the countdown reaches zero
4. WHEN `start` is called with `seconds` less than or equal to zero, THE TimerPlugin SHALL reject the Promise with an error message indicating an invalid duration
5. WHEN `start` is called while a timer is already running, THE TimerPlugin SHALL stop the existing timer before starting the new one

### Requirement 2: Foreground Service Lifecycle

**User Story:** As a user, I want the timer to keep running accurately even when the app is in the background or the screen is off, so that my alarm always fires on time.

#### Acceptance Criteria

1. WHEN `TimerPlugin.start()` is called, THE TimerForegroundService SHALL start as an Android Foreground Service with a persistent notification
2. WHILE the TimerForegroundService is running, THE TimerForegroundService SHALL maintain the countdown using a native `CountDownTimer` independent of the WebView
3. WHEN the countdown reaches zero, THE TimerForegroundService SHALL stop itself and remove the persistent notification
4. WHEN `TimerPlugin.stop()` is called, THE TimerForegroundService SHALL cancel the countdown, stop itself, and remove the persistent notification
5. WHILE the TimerForegroundService is running, THE TimerForegroundService SHALL remain unaffected by Android Doze mode, battery optimization, or app suspension

### Requirement 3: Persistent Notification with Live Countdown

**User Story:** As a user, I want to see the remaining time in my notification shade without opening the app, so that I can check my timer at a glance.

#### Acceptance Criteria

1. WHILE the TimerForegroundService is running, THE Persistent_Notification SHALL display the remaining time in MM:SS format
2. WHILE the TimerForegroundService is running, THE Persistent_Notification SHALL update the displayed time every second
3. THE Persistent_Notification SHALL display the title provided in the `start` options, or "Timer de enfoque" when no title is provided
4. THE Persistent_Notification SHALL use the Foreground_Service_Channel with importance level HIGH

### Requirement 4: Cancel from Notification

**User Story:** As a user, I want to cancel the timer directly from the notification without opening the app, so that I can stop it quickly.

#### Acceptance Criteria

1. THE Persistent_Notification SHALL include an action button labeled "Cancelar"
2. WHEN the user taps the "Cancelar" action button, THE TimerForegroundService SHALL cancel the countdown, stop itself, and remove the persistent notification
3. WHEN the user taps the "Cancelar" action button, THE TimerPlugin SHALL emit a `timerCancelled` event to the JavaScript layer

### Requirement 5: Alarm Sound and Vibration on Completion

**User Story:** As a user, I want the timer alarm to sound and vibrate exactly when time runs out, so that I am reliably notified regardless of app state.

#### Acceptance Criteria

1. WHEN the countdown reaches zero, THE TimerForegroundService SHALL play the audio file located at `res/raw/timer_done.wav`
2. WHEN the countdown reaches zero, THE TimerForegroundService SHALL trigger a vibration with the pattern [100ms on, 80ms off, 100ms on, 80ms off, 300ms on]
3. WHEN the countdown reaches zero, THE TimerForegroundService SHALL display a completion notification with the title "⏰ Timer terminado" and a body describing the elapsed session
4. WHEN the countdown reaches zero, THE TimerPlugin SHALL emit the Timer_Finished_Event to the JavaScript layer

### Requirement 6: Integration with Existing TimerService

**User Story:** As a developer, I want the existing TimerService to use the native plugin instead of scheduling notifications, so that the timer alarm is reliable without changing the rest of the app architecture.

#### Acceptance Criteria

1. WHEN `TimerService.start()` is called, THE TimerService SHALL invoke `TimerPlugin.start()` with the duration in seconds and the knot title
2. WHEN `TimerService.stop()` is called, THE TimerService SHALL invoke `TimerPlugin.stop()`
3. WHEN the Timer_Finished_Event is received, THE TimerService SHALL update the timer state to indicate completion (running = false, secondsLeft = 0)
4. WHILE the app is in foreground and the Timer_Finished_Event is received, THE FocusTimerModalComponent SHALL suppress its own audio playback to avoid double-play with the native alarm

### Requirement 7: Cleanup of Legacy Timer Alarm Code

**User Story:** As a developer, I want to remove the obsolete notification-based timer alarm code, so that the codebase does not have duplicate or dead logic.

#### Acceptance Criteria

1. THE NotificationService SHALL NOT contain the `scheduleTimerAlarm` method after the migration
2. THE NotificationService SHALL NOT contain the `cancelTimerAlarm` method after the migration
3. THE NotificationService SHALL NOT contain the `ensureAlarmChannel` method or the `nudos_timer_alarm` channel creation logic after the migration
4. THE NotificationService SHALL retain all other notification methods (morning, streak, celebration, inactivity, test)

### Requirement 8: Android Manifest and Permissions

**User Story:** As a developer, I want the proper Android permissions and service declarations in the manifest, so that the Foreground Service can run without runtime errors.

#### Acceptance Criteria

1. THE AndroidManifest SHALL declare the `android.permission.FOREGROUND_SERVICE` permission
2. THE AndroidManifest SHALL declare the `android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK` permission for Android 14+ compatibility
3. THE AndroidManifest SHALL declare the TimerForegroundService component with `android:foregroundServiceType="mediaPlayback"`
4. THE AndroidManifest SHALL declare a BroadcastReceiver for the notification cancel action

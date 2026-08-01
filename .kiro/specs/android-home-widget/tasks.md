# Implementation Plan: Android Home Widget

## Overview

Implement a 4×2 Android home screen widget for the Nudos app that displays the current DOING knot, daily progress, and next unlockable knot. The widget enables zero-friction timer start without opening the app. Implementation proceeds: TypeScript plugin definition → Java bridge plugin → data model/parser → widget provider + layout + metadata → timer receiver → manifest wiring → Angular service integration → tests.

## Tasks

- [x] 1. Create TypeScript plugin interface and Angular service
  - [x] 1.1 Create WidgetBridgePlugin TypeScript interface
    - Create `src/app/plugins/widget-bridge-plugin.ts`
    - Define `WidgetData` interface with fields: `currentKnot` (nullable object with id, title, estMinutes, nextStep), `nextUnlockable` (nullable object with id, title), `doneTodayCount` (number), `dailyGoal` (number)
    - Define `WidgetBridgePluginInterface` with `updateWidgetData(data: WidgetData): Promise<void>`
    - Register plugin via `registerPlugin<WidgetBridgePluginInterface>('WidgetBridgePlugin')`
    - Export default `WidgetBridgePlugin` instance
    - Follow same pattern as `src/app/plugins/timer-plugin.ts`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

  - [x] 1.2 Create WidgetBridgeService
    - Create `src/app/services/widget-bridge.service.ts` as `@Injectable({ providedIn: 'root' })`
    - Inject `StoreService`, `GoalService`, and `Platform` (from `@ionic/angular`)
    - In constructor: if `platform.is('android')`, subscribe to `store.knots$` and call `pushWidgetData(knots)`
    - Implement `pushWidgetData(knots: Knot[])`: find first DOING knot as `currentKnot`, find first UNLOCKABLE knot as `nextUnlockable`, call `goal.countDoneToday(knots)` for `doneTodayCount`, call `goal.getDailyGoal()` for `dailyGoal`
    - Build `WidgetData` object and call `WidgetBridgePlugin.updateWidgetData(data)`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

  - [x] 1.3 Register WidgetBridgeService in AppModule/AppComponent
    - Inject `WidgetBridgeService` in the root component or app initializer to ensure it starts on app launch
    - The service auto-subscribes in constructor, so injection is sufficient
    - _Requirements: 1.1_

- [x] 2. Implement Java native plugin layer
  - [x] 2.1 Create WidgetBridgePlugin.java
    - Create `android/app/src/main/java/com/nudos/app/WidgetBridgePlugin.java`
    - Annotate with `@CapacitorPlugin(name = "WidgetBridgePlugin")`
    - Implement `updateWidgetData(PluginCall call)` annotated with `@PluginMethod()`
    - Read `call.getData()` and serialize to JSON string
    - Write JSON to SharedPreferences file `com.nudos.app.widget_data` under key `widget_json`
    - After write: get AppWidgetManager instance, get widget IDs for `NudosWidget.class`, broadcast `APPWIDGET_UPDATE` intent with widget IDs as extras
    - Call `call.resolve()` on success
    - _Requirements: 1.1, 1.2, 1.5_

  - [x] 2.2 Create WidgetDataModel.java
    - Create `android/app/src/main/java/com/nudos/app/WidgetDataModel.java`
    - Define fields: `CurrentKnot currentKnot` (nullable), `NextUnlockable nextUnlockable` (nullable), `int doneTodayCount`, `int dailyGoal`, `boolean isValid`
    - Define inner class `CurrentKnot` with fields: `String id`, `String title`, `Integer estMinutes` (nullable), `String nextStep` (nullable)
    - Define inner class `NextUnlockable` with fields: `String id`, `String title`
    - Implement `static WidgetDataModel empty()` returning model with nulls, doneTodayCount=0, dailyGoal=1, isValid=false
    - Implement `static WidgetDataModel fromJson(JSONObject obj)` with null-safe field access and defaults for missing fields
    - Implement `static int computeTimerSeconds(Integer estMinutes)` — returns `estMinutes * 60` if positive, else 300
    - Implement `static int computeProgressPercent(int doneTodayCount, int dailyGoal)` — returns `min(100, (doneTodayCount * 100) / dailyGoal)`, 0 if dailyGoal ≤ 0
    - Implement `static String formatProgressText(int doneTodayCount, int dailyGoal)` — returns `"{done}/{goal}"`
    - Implement `static boolean isGoalMet(int doneTodayCount, int dailyGoal)` — returns `doneTodayCount >= dailyGoal`
    - _Requirements: 1.2, 1.3, 1.4, 4.2, 4.3, 5.1, 5.2, 5.3, 8.3_

  - [x] 2.3 Create WidgetDataParser.java
    - Create `android/app/src/main/java/com/nudos/app/WidgetDataParser.java`
    - Implement `static WidgetDataModel parse(Context context)` — reads SharedPreferences `com.nudos.app.widget_data`, key `widget_json`, calls `parseJson()`
    - Implement `static WidgetDataModel parseJson(String json)` — returns `WidgetDataModel.empty()` if json is null/empty, parses with JSONObject, catches JSONException returning empty model
    - _Requirements: 8.1, 8.3_

  - [x] 2.4 Create WidgetTimerReceiver.java
    - Create `android/app/src/main/java/com/nudos/app/WidgetTimerReceiver.java`
    - Extend `BroadcastReceiver`
    - Define `ACTION_START_TIMER = "com.nudos.app.ACTION_WIDGET_START_TIMER"`
    - In `onReceive()`: check action matches, extract `seconds` (default 300) and `title` (default "Timer de enfoque") from intent extras
    - Create Intent for `TimerForegroundService.class` with seconds and title extras
    - Call `context.startForegroundService(intent)` wrapped in try-catch
    - On exception: fallback to launching `MainActivity` with `FLAG_ACTIVITY_NEW_TASK`
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 8.2_

- [x] 3. Implement NudosWidget AppWidgetProvider
  - [x] 3.1 Create NudosWidget.java
    - Create `android/app/src/main/java/com/nudos/app/NudosWidget.java`
    - Extend `AppWidgetProvider`
    - Override `onUpdate()`: iterate appWidgetIds, call `buildRemoteViews()`, update each widget
    - Override `onReceive()`: call super, handle `BOOT_COMPLETED` action by triggering `onUpdate()`
    - Implement `buildRemoteViews(Context)`: read data via `WidgetDataParser.parse()`, build RemoteViews from `R.layout.widget_nudos`
    - Implement `renderCurrentKnotSection()`: set title text (or "Sin nudo activo" if null), set nextStep visibility, set timer button visibility and PendingIntent
    - Implement `renderProgressSection()`: set progress text via `formatProgressText()`, set progress bar value via `computeProgressPercent()`, apply color change if `isGoalMet()`
    - Implement `renderNextUnlockableSection()`: set title (or "Nada desbloqueable" if null), set deep-link PendingIntent with knot_id extra
    - Handle empty/invalid data: show "Abre Nudos para empezar" with tap-to-open-app PendingIntent
    - Timer PendingIntent: broadcast to `WidgetTimerReceiver` with action `ACTION_WIDGET_START_TIMER`, extras: seconds (computeTimerSeconds), title
    - Deep-link PendingIntent: activity Intent to `MainActivity` with action `com.nudos.app.ACTION_OPEN_KNOT`, extra `knot_id`
    - _Requirements: 3.1, 3.2, 3.3, 4.1, 4.2, 4.3, 5.1, 5.2, 5.3, 6.1, 6.2, 6.3, 7.1, 7.3, 8.1_

- [x] 4. Create widget XML resources
  - [x] 4.1 Create widget layout XML
    - Create `android/app/src/main/res/layout/widget_nudos.xml`
    - Root: `LinearLayout` horizontal, min 250dp × 110dp, rounded-corner background (drawable), semi-transparent dark
    - Left section (weight 2): vertical `LinearLayout` containing `txt_current_title` (singleLine, ellipsize end), `txt_next_step` (singleLine, ellipsize end, visibility GONE by default), `btn_start_timer` (ImageButton or Button with play icon, visibility GONE by default)
    - Right section (weight 1): vertical `LinearLayout` containing `txt_progress` (text "{done}/{goal}"), `progress_bar` (ProgressBar horizontal, max=100), label "Siguiente:", `txt_next_unlockable_title` (singleLine, ellipsize end, clickable)
    - Add `txt_empty_state` (visibility GONE) for "Abre Nudos para empezar" fallback
    - Use `@color/` and `@dimen/` references for theming consistency
    - _Requirements: 2.1, 2.3, 3.1, 3.2, 5.1, 5.2, 6.1, 6.3, 8.1_

  - [x] 4.2 Create widget metadata XML
    - Create `android/app/src/main/res/xml/nudos_widget_info.xml`
    - Set `minWidth="250dp"`, `minHeight="110dp"`
    - Set `updatePeriodMillis="1800000"` (30 minutes)
    - Set `initialLayout="@layout/widget_nudos"`
    - Set `resizeMode="horizontal|vertical"`
    - Set `widgetCategory="home_screen"`
    - Set `previewImage="@drawable/widget_preview"`
    - _Requirements: 2.1, 2.2, 7.4_

  - [x] 4.3 Create widget background drawable
    - Create `android/app/src/main/res/drawable/widget_background.xml`
    - Shape with rounded corners (8dp radius), semi-transparent dark fill (#CC1E1E2E or similar)
    - _Requirements: 2.1_

  - [x] 4.4 Add widget preview placeholder image
    - Create `android/app/src/main/res/drawable/widget_preview.png` as a placeholder preview image
    - Can be a simple solid-color rectangle or screenshot placeholder (to be replaced with actual preview later)
    - _Requirements: 2.1_

- [x] 5. Update AndroidManifest and register plugin
  - [x] 5.1 Update AndroidManifest.xml with widget declarations
    - Add `<receiver android:name=".NudosWidget" android:exported="true">` with intent-filter for `android.appwidget.action.APPWIDGET_UPDATE` and `android.intent.action.BOOT_COMPLETED`
    - Add `<meta-data android:name="android.appwidget.provider" android:resource="@xml/nudos_widget_info" />`
    - Add `<receiver android:name=".WidgetTimerReceiver" android:exported="false">` with intent-filter for `com.nudos.app.ACTION_WIDGET_START_TIMER`
    - _Requirements: 2.1, 4.4, 7.1, 7.3_

  - [x] 5.2 Register WidgetBridgePlugin in MainActivity
    - In `android/app/src/main/java/com/nudos/app/MainActivity.java`, add `registerPlugin(WidgetBridgePlugin.class)` in `onCreate()` before `super.onCreate()`
    - _Requirements: 1.1_

- [x] 6. Checkpoint - Verify TypeScript build and review Java files
  - Ensure `ng build` passes with no errors for the TypeScript side (plugin interface + service).
  - Review Java files for correctness (native code cannot be compiled in this environment but can be validated via code review).
  - Ask the user if questions arise.

- [x] 7. Write tests for computation logic
  - [ ]* 7.1 Write property test for timer seconds computation
    - **Property 2: Timer intent seconds computation**
    - Use fast-check to generate `fc.option(fc.integer({ min: -100, max: 200 }))` for estMinutes
    - Verify: if estMinutes > 0 → result === estMinutes * 60; otherwise → result === 300
    - Create test in `src/app/plugins/widget-bridge-plugin.spec.ts` or `src/app/utils/widget-computations.spec.ts`
    - Port `computeTimerSeconds` as a pure TypeScript function for testing
    - **Validates: Requirements 4.2, 4.3**

  - [ ]* 7.2 Write property test for progress percentage computation
    - **Property 3: Progress percentage computation**
    - Use fast-check to generate `fc.integer({ min: 0, max: 100 })` for doneTodayCount and `fc.integer({ min: 1, max: 20 })` for dailyGoal
    - Verify: result === Math.min(100, Math.floor((doneTodayCount * 100) / dailyGoal))
    - Verify `formatProgressText` returns `"{done}/{goal}"` string
    - Verify `isGoalMet` returns `doneTodayCount >= dailyGoal`
    - Port `computeProgressPercent`, `formatProgressText`, `isGoalMet` as TypeScript functions
    - **Validates: Requirements 5.1, 5.2, 5.3**

  - [ ]* 7.3 Write property test for widget data serialization correctness
    - **Property 1: Widget data serialization correctness**
    - Use fast-check to generate arbitrary knot arrays with random statuses (DOING, UNLOCKABLE, DONE, etc.) and a dailyGoal in 1–20
    - Verify: `currentKnot` matches first DOING knot's projected fields (or null), `nextUnlockable` matches first UNLOCKABLE knot's projected fields (or null), `doneTodayCount` matches filtered DONE count for today
    - Test in `src/app/services/widget-bridge.service.spec.ts`
    - **Validates: Requirements 1.2, 1.3, 1.4**

  - [ ]* 7.4 Write property test for invalid JSON produces empty model
    - **Property 5: Invalid JSON produces empty model**
    - Use fast-check to generate arbitrary strings (non-JSON), null, and empty string
    - Port `parseJson` logic as TypeScript; verify result has isValid=false, currentKnot=null, nextUnlockable=null, doneTodayCount=0, dailyGoal=1
    - **Validates: Requirements 8.1**

  - [ ]* 7.5 Write property test for partial JSON resilience
    - **Property 6: Partial JSON resilience**
    - Use fast-check to generate valid JSON objects with arbitrarily missing fields (subset of widget data schema keys)
    - Verify: parsing never throws, missing fields default to expected values
    - **Validates: Requirements 8.3**

  - [ ]* 7.6 Write unit tests for WidgetBridgeService push logic
    - Mock `StoreService.knots$`, `GoalService.countDoneToday()`, `GoalService.getDailyGoal()`, `Platform.is()`
    - Test: when platform is not android, no subscription is created
    - Test: when knots$ emits with a DOING knot, `updateWidgetData` is called with correct currentKnot fields
    - Test: when no DOING knot exists, currentKnot is null
    - Test: when no UNLOCKABLE knot exists, nextUnlockable is null
    - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [-] 8. Final checkpoint - Ensure all tests pass and build succeeds
  - Run `ng build` to verify TypeScript compilation.
  - Run unit/property tests via the project's test runner.
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document using fast-check
- Unit tests validate specific examples and edge cases
- Native Java code cannot be compiled in this environment but can be verified for correctness via code review
- The TypeScript side can be built with `ng build` and synced with `npx cap sync android`
- The `computeTimerSeconds`, `computeProgressPercent`, `formatProgressText`, and `isGoalMet` functions are ported to TypeScript for testability (mirroring the Java implementations)
- Widget preview image is a placeholder; replace with actual screenshot after first successful deployment

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "4.1", "4.2", "4.3", "4.4"] },
    { "id": 1, "tasks": ["1.2", "2.1", "2.2", "2.3"] },
    { "id": 2, "tasks": ["1.3", "2.4", "3.1"] },
    { "id": 3, "tasks": ["5.1", "5.2"] },
    { "id": 4, "tasks": ["7.1", "7.2", "7.3", "7.4", "7.5", "7.6"] }
  ]
}
```

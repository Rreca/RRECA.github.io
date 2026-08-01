# Design Document: Android Home Widget

## Overview

This document describes the technical design for the Android Home Widget feature. The widget provides at-a-glance visibility of the current DOING knot, daily progress, and next unlockable knot on the Android home screen. It enables zero-friction timer start without opening the app.

## Architecture

The Android Home Widget feature follows a **bridge-render** architecture where the Capacitor web layer pushes serialized state to native Android SharedPreferences, and a standard AppWidgetProvider reads that state to build RemoteViews.

```
┌─────────────────────────────────────────────────────────────────┐
│  Angular/Capacitor Web Layer                                    │
│                                                                 │
│  StoreService ──► knots$ change ──► WidgetBridgePlugin.update() │
│  GoalService  ──► countDoneToday / getDailyGoal                 │
└───────────────────────────┬─────────────────────────────────────┘
                            │ Plugin call (Java)
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  WidgetBridgePlugin (Capacitor Plugin)                          │
│  • Receives knot list + goal data                               │
│  • Computes current_knot, next_unlockable, done_today, goal     │
│  • Serializes JSON → SharedPreferences "com.nudos.app.widget_data" │
│  • Broadcasts APPWIDGET_UPDATE                                  │
└───────────────────────────┬─────────────────────────────────────┘
                            │ SharedPreferences write + broadcast
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  NudosWidget (AppWidgetProvider)                                │
│  • onUpdate(): reads SharedPreferences, builds RemoteViews      │
│  • Sections: Current Knot | Progress | Next Unlockable          │
│  • PendingIntents: timer start, deep-link tap                   │
└───────────────────────────┬─────────────────────────────────────┘
                            │ PendingIntent (timer)
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  TimerForegroundService (existing)                              │
│  • Started directly via Intent from widget BroadcastReceiver    │
│  • No Activity launch required                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Components and Interfaces

### 1. WidgetBridgePlugin (TypeScript + Java)

**TypeScript side:** `src/app/plugins/widget-bridge-plugin.ts`

```typescript
import { registerPlugin } from '@capacitor/core';

export interface WidgetData {
  currentKnot: { id: string; title: string; estMinutes: number | null; nextStep: string | null } | null;
  nextUnlockable: { id: string; title: string } | null;
  doneTodayCount: number;
  dailyGoal: number;
}

export interface WidgetBridgePluginInterface {
  updateWidgetData(data: WidgetData): Promise<void>;
}

const WidgetBridgePlugin = registerPlugin<WidgetBridgePluginInterface>('WidgetBridgePlugin');
export default WidgetBridgePlugin;
```

**Java side:** `android/app/src/main/java/com/nudos/app/WidgetBridgePlugin.java`

```java
@CapacitorPlugin(name = "WidgetBridgePlugin")
public class WidgetBridgePlugin extends Plugin {

    private static final String PREFS_NAME = "com.nudos.app.widget_data";
    private static final String KEY_DATA = "widget_json";

    @PluginMethod()
    public void updateWidgetData(PluginCall call) {
        JSObject data = call.getData();
        String json = data.toString();

        SharedPreferences prefs = getContext()
            .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        prefs.edit().putString(KEY_DATA, json).apply();

        // Broadcast widget update
        Intent intent = new Intent(AppWidgetManager.ACTION_APPWIDGET_UPDATE);
        intent.setPackage(getContext().getPackageName());
        ComponentName widget = new ComponentName(getContext(), NudosWidget.class);
        int[] ids = AppWidgetManager.getInstance(getContext()).getAppWidgetIds(widget);
        intent.putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids);
        getContext().sendBroadcast(intent);

        call.resolve();
    }
}
```

### 2. NudosWidget (AppWidgetProvider)

**File:** `android/app/src/main/java/com/nudos/app/NudosWidget.java`

```java
public class NudosWidget extends AppWidgetProvider {

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        for (int appWidgetId : appWidgetIds) {
            RemoteViews views = buildRemoteViews(context);
            appWidgetManager.updateAppWidget(appWidgetId, views);
        }
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);
        // Handle boot completed
        if (Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) {
            AppWidgetManager mgr = AppWidgetManager.getInstance(context);
            ComponentName cn = new ComponentName(context, NudosWidget.class);
            int[] ids = mgr.getAppWidgetIds(cn);
            onUpdate(context, mgr, ids);
        }
    }

    private RemoteViews buildRemoteViews(Context context) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_nudos);
        WidgetDataModel data = WidgetDataParser.parse(context);

        renderCurrentKnotSection(context, views, data);
        renderProgressSection(views, data);
        renderNextUnlockableSection(context, views, data);

        return views;
    }
    // ... section renderers
}
```

### 3. WidgetTimerReceiver (BroadcastReceiver)

**File:** `android/app/src/main/java/com/nudos/app/WidgetTimerReceiver.java`

Handles the timer start PendingIntent from the widget without launching the Activity.

```java
public class WidgetTimerReceiver extends BroadcastReceiver {

    private static final String ACTION_START_TIMER = "com.nudos.app.ACTION_WIDGET_START_TIMER";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (ACTION_START_TIMER.equals(intent.getAction())) {
            int seconds = intent.getIntExtra("seconds", 300);
            String title = intent.getStringExtra("title");

            Intent serviceIntent = new Intent(context, TimerForegroundService.class);
            serviceIntent.putExtra("seconds", seconds);
            serviceIntent.putExtra("title", title != null ? title : "Timer de enfoque");

            try {
                context.startForegroundService(serviceIntent);
            } catch (Exception e) {
                // Fallback: launch app
                Intent appIntent = new Intent(context, MainActivity.class);
                appIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                context.startActivity(appIntent);
            }
        }
    }
}
```

### 4. WidgetDataParser (Utility)

**File:** `android/app/src/main/java/com/nudos/app/WidgetDataParser.java`

Pure utility that reads SharedPreferences and returns a typed data model. Handles null/missing/invalid JSON gracefully.

```java
public class WidgetDataParser {

    public static WidgetDataModel parse(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(
            "com.nudos.app.widget_data", Context.MODE_PRIVATE);
        String json = prefs.getString("widget_json", null);
        return parseJson(json);
    }

    public static WidgetDataModel parseJson(String json) {
        if (json == null || json.isEmpty()) {
            return WidgetDataModel.empty();
        }
        try {
            JSONObject obj = new JSONObject(json);
            return WidgetDataModel.fromJson(obj);
        } catch (JSONException e) {
            return WidgetDataModel.empty();
        }
    }
}
```

### 5. WidgetDataModel (Data Class)

**File:** `android/app/src/main/java/com/nudos/app/WidgetDataModel.java`

```java
public class WidgetDataModel {
    public final CurrentKnot currentKnot;      // nullable
    public final NextUnlockable nextUnlockable; // nullable
    public final int doneTodayCount;
    public final int dailyGoal;
    public final boolean isValid;

    public static WidgetDataModel empty() {
        return new WidgetDataModel(null, null, 0, 1, false);
    }

    public static WidgetDataModel fromJson(JSONObject obj) {
        // Parse with null-safe field access, default values for missing fields
    }

    public static class CurrentKnot {
        public final String id;
        public final String title;
        public final Integer estMinutes; // nullable
        public final String nextStep;    // nullable
    }

    public static class NextUnlockable {
        public final String id;
        public final String title;
    }
}
```

## Data Models

### SharedPreferences JSON Schema

**SharedPreferences file:** `com.nudos.app.widget_data`  
**Key:** `widget_json`

```json
{
  "currentKnot": {
    "id": "uuid-string",
    "title": "Knot title text",
    "estMinutes": 25,
    "nextStep": "Next step description or null"
  },
  "nextUnlockable": {
    "id": "uuid-string",
    "title": "Next unlockable knot title"
  },
  "doneTodayCount": 3,
  "dailyGoal": 5
}
```

**Nullability rules:**
- `currentKnot`: `null` when no knot has status `DOING`
- `nextUnlockable`: `null` when no knot has status `UNLOCKABLE`
- `currentKnot.estMinutes`: `null` when the knot has no estimated duration
- `currentKnot.nextStep`: `null` when the knot has no next step defined
- `doneTodayCount`: always integer ≥ 0
- `dailyGoal`: always integer 1–20, defaults to 1

## Widget Layout (RemoteViews)

**File:** `android/app/src/main/res/layout/widget_nudos.xml`

```
┌──────────────────────────────────────────────────────────────────┐
│ widget_nudos.xml — LinearLayout (horizontal, 250dp × 110dp min)  │
├────────────────────────────┬─────────────────────────────────────┤
│  LEFT SECTION (weight 2)   │  RIGHT SECTION (weight 1)           │
│                            │                                     │
│  ┌──────────────────────┐  │  ┌───────────────────────────────┐  │
│  │ txt_current_title    │  │  │ txt_progress "3/5"            │  │
│  │ (singleLine,ellipsis)│  │  │ progress_bar ████░░░░         │  │
│  ├──────────────────────┤  │  ├───────────────────────────────┤  │
│  │ txt_next_step        │  │  │ txt_next_unlockable_label     │  │
│  │ (singleLine,ellipsis)│  │  │ "Siguiente:"                  │  │
│  ├──────────────────────┤  │  │ txt_next_unlockable_title     │  │
│  │ btn_start_timer  ▶   │  │  │ (singleLine, clickable)       │  │
│  └──────────────────────┘  │  └───────────────────────────────┘  │
├────────────────────────────┴─────────────────────────────────────┤
│  Background: rounded corners, semi-transparent dark              │
└──────────────────────────────────────────────────────────────────┘
```

**Key view IDs:**
- `txt_current_title` — Current knot title or "Sin nudo activo"
- `txt_next_step` — Current knot next step (GONE when null)
- `btn_start_timer` — Timer start button (GONE when no current knot)
- `txt_progress` — "{done}/{goal}" fraction
- `progress_bar` — ProgressBar (horizontal, max=100)
- `txt_next_unlockable_title` — Next unlockable title or "Nada desbloqueable"

## Widget Metadata

**File:** `android/app/src/main/res/xml/nudos_widget_info.xml`

```xml
<?xml version="1.0" encoding="utf-8"?>
<appwidget-provider xmlns:android="http://schemas.android.com/apk/res/android"
    android:minWidth="250dp"
    android:minHeight="110dp"
    android:updatePeriodMillis="1800000"
    android:initialLayout="@layout/widget_nudos"
    android:resizeMode="horizontal|vertical"
    android:widgetCategory="home_screen"
    android:previewImage="@drawable/widget_preview" />
```

## AndroidManifest Additions

```xml
<!-- Widget Provider -->
<receiver
    android:name=".NudosWidget"
    android:exported="true">
    <intent-filter>
        <action android:name="android.appwidget.action.APPWIDGET_UPDATE" />
        <action android:name="android.intent.action.BOOT_COMPLETED" />
    </intent-filter>
    <meta-data
        android:name="android.appwidget.provider"
        android:resource="@xml/nudos_widget_info" />
</receiver>

<!-- Timer start receiver (widget → service, no Activity) -->
<receiver
    android:name=".WidgetTimerReceiver"
    android:exported="false">
    <intent-filter>
        <action android:name="com.nudos.app.ACTION_WIDGET_START_TIMER" />
    </intent-filter>
</receiver>
```

## MainActivity Registration (updated)

```java
@Override
public void onCreate(Bundle savedInstanceState) {
    registerPlugin(TimerPlugin.class);
    registerPlugin(WidgetBridgePlugin.class);
    super.onCreate(savedInstanceState);
}
```

## Angular Integration Point

The TypeScript layer calls `WidgetBridgePlugin.updateWidgetData()` whenever knot state changes. This is triggered from a dedicated Angular service:

**File:** `src/app/services/widget-bridge.service.ts`

```typescript
@Injectable({ providedIn: 'root' })
export class WidgetBridgeService {
  constructor(
    private store: StoreService,
    private goal: GoalService,
    private platform: Platform
  ) {
    if (this.platform.is('android')) {
      this.store.knots$.subscribe(knots => this.pushWidgetData(knots));
    }
  }

  private pushWidgetData(knots: Knot[]): void {
    const currentKnot = knots.find(k => k.status === 'DOING') ?? null;
    const nextUnlockable = knots.find(k => k.status === 'UNLOCKABLE') ?? null;

    const data: WidgetData = {
      currentKnot: currentKnot ? {
        id: currentKnot.id,
        title: currentKnot.title,
        estMinutes: currentKnot.estMinutes ?? null,
        nextStep: currentKnot.nextStep ?? null,
      } : null,
      nextUnlockable: nextUnlockable ? {
        id: nextUnlockable.id,
        title: nextUnlockable.title,
      } : null,
      doneTodayCount: this.goal.countDoneToday(knots),
      dailyGoal: this.goal.getDailyGoal(),
    };

    WidgetBridgePlugin.updateWidgetData(data);
  }
}
```

## Intent & PendingIntent Design

### Timer Start (Widget → Service)

```
PendingIntent (broadcast) → WidgetTimerReceiver
  action: "com.nudos.app.ACTION_WIDGET_START_TIMER"
  extras:
    "seconds": int (estMinutes * 60, or 300 if null/zero)
    "title": String (knot title)

WidgetTimerReceiver.onReceive() →
  Intent → TimerForegroundService
    extras: "seconds", "title"
  context.startForegroundService(intent)
```

### Deep-Link (Widget → App)

```
PendingIntent (activity) → MainActivity
  action: "com.nudos.app.ACTION_OPEN_KNOT"
  extras:
    "knot_id": String (next unlockable knot ID)
  flags: FLAG_ACTIVITY_NEW_TASK | FLAG_ACTIVITY_CLEAR_TOP
```

### Fallback (No data → App)

```
PendingIntent (activity) → MainActivity
  flags: FLAG_ACTIVITY_NEW_TASK
  (no extras — just opens the app)
```

## Timer Duration Computation

```java
public static int computeTimerSeconds(Integer estMinutes) {
    if (estMinutes == null || estMinutes <= 0) {
        return 300; // default 5 minutes
    }
    return estMinutes * 60;
}
```

## Progress Computation

```java
public static int computeProgressPercent(int doneTodayCount, int dailyGoal) {
    if (dailyGoal <= 0) return 0;
    int percent = (doneTodayCount * 100) / dailyGoal;
    return Math.min(percent, 100);
}

public static String formatProgressText(int doneTodayCount, int dailyGoal) {
    return doneTodayCount + "/" + dailyGoal;
}

public static boolean isGoalMet(int doneTodayCount, int dailyGoal) {
    return doneTodayCount >= dailyGoal;
}
```

## Error Handling

| Scenario | Behavior |
|----------|----------|
| SharedPreferences empty / no `widget_json` key | Show "Abre Nudos para empezar" + tap launches app |
| `widget_json` contains invalid JSON | Show "Abre Nudos para empezar" + tap launches app |
| `currentKnot` field missing or null | Show "Sin nudo activo", hide timer button |
| `nextUnlockable` field missing or null | Show "Nada desbloqueable" |
| `estMinutes` null or 0 | Use default 300 seconds for timer |
| `doneTodayCount` missing | Default to 0 |
| `dailyGoal` missing | Default to 1 |
| `startForegroundService` throws | Fallback: launch app activity |

## Testing Strategy

- **Property-based tests** validate the pure computation functions (serialization, timer seconds, progress computation, JSON parsing/resilience) across randomized inputs.
- **Unit tests** verify specific rendering behaviors (view visibility, text content for known states).
- **Integration tests** verify the Android lifecycle (broadcast → onUpdate, boot receiver, SharedPreferences listener registration).
- **Smoke tests** verify static XML configuration (widget size, update interval, manifest declarations).

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Widget data serialization correctness

*For any* list of Knots and a valid daily goal (1–20), the `WidgetBridgeService.pushWidgetData` function SHALL produce a WidgetData object where: `currentKnot` equals the first DOING knot's projected fields (or null if none exists), `nextUnlockable` equals the first UNLOCKABLE knot's projected fields (or null if none exists), `doneTodayCount` equals the count of DONE knots with `doneAt` within today, and `dailyGoal` equals the configured goal value.

**Validates: Requirements 1.2, 1.3, 1.4**

### Property 2: Timer intent seconds computation

*For any* `estMinutes` value (including null and zero), the `computeTimerSeconds` function SHALL return `estMinutes * 60` when estMinutes is a positive integer, and SHALL return 300 when estMinutes is null or ≤ 0.

**Validates: Requirements 4.2, 4.3**

### Property 3: Progress percentage computation

*For any* `doneTodayCount` (≥ 0) and `dailyGoal` (1–20), the `computeProgressPercent` function SHALL return `min(100, floor((doneTodayCount / dailyGoal) * 100))`, and `formatProgressText` SHALL return the string `"{doneTodayCount}/{dailyGoal}"`.

**Validates: Requirements 5.1, 5.2, 5.3**

### Property 4: Deep-link intent contains knot ID

*For any* non-null `nextUnlockable` knot with an id string, the PendingIntent constructed for the Next Unlockable section SHALL contain the extra `"knot_id"` with value equal to that knot's id.

**Validates: Requirements 6.2**

### Property 5: Invalid JSON produces empty model

*For any* string that is not valid JSON (including null and empty string), `WidgetDataParser.parseJson` SHALL return a `WidgetDataModel` with `isValid = false`, `currentKnot = null`, `nextUnlockable = null`, `doneTodayCount = 0`, and `dailyGoal = 1`.

**Validates: Requirements 8.1**

### Property 6: Partial JSON resilience

*For any* valid JSON object with arbitrarily missing fields from the widget data schema, `WidgetDataModel.fromJson` SHALL return a model without throwing an exception, where each missing field assumes its default value (`currentKnot → null`, `nextUnlockable → null`, `doneTodayCount → 0`, `dailyGoal → 1`).

**Validates: Requirements 8.3**

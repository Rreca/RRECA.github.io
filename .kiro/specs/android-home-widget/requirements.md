# Requirements Document

## Introduction

Android home screen widget (4×2 cells) for the Nudos app that provides at-a-glance visibility into the current knot (status DOING), daily progress toward the configured goal, and the next unlockable knot. The widget enables zero-friction timer start directly from the home screen without opening the app, and taps on the next unlockable knot deep-link into the app for quick action.

## Glossary

- **Widget**: An Android AppWidget (4 columns × 2 rows) registered with the system launcher, rendered via RemoteViews.
- **Knot**: A task unit in the Nudos app with fields id, title, status, estMinutes, and nextStep.
- **Current_Knot**: The first Knot with status `DOING` found in the shared data source.
- **Next_Unlockable_Knot**: The first Knot with status `UNLOCKABLE` found in the shared data source.
- **Widget_SharedPreferences**: An Android SharedPreferences file (`com.nudos.app.widget_data`) written by the Capacitor plugin bridge containing a reduced JSON representation of app state.
- **Daily_Goal**: An integer between 1 and 20 representing the user's configured target of knots done per day.
- **Done_Today_Count**: The number of knots completed today (status DONE with doneAt timestamp within the current calendar day).
- **Timer_Foreground_Service**: The existing Android foreground service started via `TimerPlugin.start({ seconds, title })`.
- **Bridge_Plugin**: A Capacitor plugin that serializes widget-relevant data to Widget_SharedPreferences each time knot data changes.
- **App**: The main Nudos Capacitor/Angular application (package `com.nudos.app`).

## Requirements

### Requirement 1: Widget Data Bridge

**User Story:** As a developer, I want the app to persist widget-relevant data to SharedPreferences, so that the widget can read current state without accessing the web view.

#### Acceptance Criteria

1. WHEN a Knot's status, title, or estMinutes field changes, THE Bridge_Plugin SHALL serialize widget data to Widget_SharedPreferences within 500ms of the change.
2. THE Bridge_Plugin SHALL write a JSON object containing: the Current_Knot (id, title, estMinutes, nextStep), the Next_Unlockable_Knot (id, title), Done_Today_Count, and Daily_Goal.
3. IF no Knot with status DOING exists, THEN THE Bridge_Plugin SHALL write a null value for the Current_Knot field.
4. IF no Knot with status UNLOCKABLE exists, THEN THE Bridge_Plugin SHALL write a null value for the Next_Unlockable_Knot field.
5. WHEN the Bridge_Plugin finishes writing to Widget_SharedPreferences, THE Bridge_Plugin SHALL broadcast an `android.appwidget.action.APPWIDGET_UPDATE` intent to trigger widget refresh.

### Requirement 2: Widget Layout and Dimensions

**User Story:** As a user, I want the widget to fit a 4×2 grid on my home screen, so that it shows key information without taking excessive space.

#### Acceptance Criteria

1. THE Widget SHALL declare a minimum size of 4 columns × 2 rows (approximately 250dp × 110dp) in the AppWidgetProviderInfo metadata.
2. THE Widget SHALL target Android SDK 26 (Android 8.0) as the minimum supported version.
3. THE Widget SHALL display three distinct sections: a Current Knot section, a Progress section, and a Next Unlockable section.

### Requirement 3: Current Knot Display

**User Story:** As a user, I want to see my current DOING knot on the widget, so that I know what to focus on at a glance.

#### Acceptance Criteria

1. WHILE a Current_Knot exists in Widget_SharedPreferences, THE Widget SHALL display the Current_Knot title (truncated to a single line with ellipsis if exceeding available width).
2. WHILE a Current_Knot exists and the Current_Knot has a non-null nextStep value, THE Widget SHALL display the nextStep text below the title (truncated to a single line with ellipsis).
3. IF no Current_Knot exists in Widget_SharedPreferences, THEN THE Widget SHALL display the text "Sin nudo activo" in the Current Knot section.

### Requirement 4: Timer Start from Widget

**User Story:** As a user, I want to start a timer directly from the widget, so that I can begin focused work without opening the app.

#### Acceptance Criteria

1. WHILE a Current_Knot exists, THE Widget SHALL display a timer start button in the Current Knot section.
2. WHEN the user taps the timer start button, THE Widget SHALL start the Timer_Foreground_Service with seconds equal to Current_Knot estMinutes multiplied by 60, and title equal to Current_Knot title.
3. IF the Current_Knot estMinutes value is null or zero, THEN THE Widget SHALL use a default duration of 300 seconds (5 minutes) when starting the Timer_Foreground_Service.
4. WHEN the user taps the timer start button, THE Widget SHALL start the Timer_Foreground_Service without launching the App activity.

### Requirement 5: Daily Progress Display

**User Story:** As a user, I want to see my daily progress on the widget, so that I stay motivated and know how close I am to my goal.

#### Acceptance Criteria

1. THE Widget SHALL display the Done_Today_Count and Daily_Goal as a fraction text in the format "{Done_Today_Count}/{Daily_Goal}".
2. THE Widget SHALL display a horizontal progress bar where the fill percentage equals (Done_Today_Count divided by Daily_Goal) multiplied by 100, capped at 100 percent.
3. WHEN Done_Today_Count equals or exceeds Daily_Goal, THE Widget SHALL apply a distinct visual indicator (color change) to the progress bar to signal goal completion.

### Requirement 6: Next Unlockable Knot Display

**User Story:** As a user, I want to see the next unlockable knot on the widget, so that I can quickly start the next actionable task.

#### Acceptance Criteria

1. WHILE a Next_Unlockable_Knot exists in Widget_SharedPreferences, THE Widget SHALL display the Next_Unlockable_Knot title (truncated to a single line with ellipsis).
2. WHEN the user taps the Next Unlockable section, THE Widget SHALL launch the App with a deep-link intent containing the Next_Unlockable_Knot id as a parameter.
3. IF no Next_Unlockable_Knot exists in Widget_SharedPreferences, THEN THE Widget SHALL display the text "Nada desbloqueable" in the Next Unlockable section.

### Requirement 7: Widget Update Lifecycle

**User Story:** As a user, I want the widget to always show current data, so that I trust the information is accurate.

#### Acceptance Criteria

1. WHEN the Widget receives an `APPWIDGET_UPDATE` broadcast, THE Widget SHALL read the latest data from Widget_SharedPreferences and re-render all sections.
2. THE Widget SHALL register a SharedPreferences change listener that triggers a re-render when Widget_SharedPreferences content changes.
3. WHEN the device completes a boot, THE Widget SHALL re-render using the last persisted data in Widget_SharedPreferences.
4. THE Widget SHALL set a periodic update interval of 30 minutes as a fallback to ensure data freshness.

### Requirement 8: Empty State and Error Handling

**User Story:** As a user, I want the widget to behave gracefully when no data is available, so that it does not crash or show broken content.

#### Acceptance Criteria

1. IF Widget_SharedPreferences contains no data or invalid JSON, THEN THE Widget SHALL display a fallback view with the text "Abre Nudos para empezar" and a tap action that launches the App.
2. IF the Timer_Foreground_Service fails to start, THEN THE Widget SHALL launch the App as a fallback action.
3. THE Widget SHALL handle null or missing fields in the SharedPreferences JSON without crashing by falling back to default display states for each section.

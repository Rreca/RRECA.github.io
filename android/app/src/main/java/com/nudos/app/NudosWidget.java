package com.nudos.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.view.View;
import android.widget.RemoteViews;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/**
 * AppWidgetProvider for the Nudos home screen widget.
 * Displays the current DOING knot, daily progress, and next unlockable knot.
 * Enables zero-friction timer start without opening the app.
 */
public class NudosWidget extends AppWidgetProvider {

    private static final String ACTION_OPEN_KNOT = "com.nudos.app.ACTION_OPEN_KNOT";

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

        // Always show the date in Spanish: "Sábado, 1 de agosto"
        Locale es = new Locale("es", "ES");
        SimpleDateFormat sdf = new SimpleDateFormat("EEEE, d 'de' MMMM", es);
        String dateStr = sdf.format(new Date());
        // Capitalize first letter
        dateStr = dateStr.substring(0, 1).toUpperCase() + dateStr.substring(1);
        views.setTextViewText(R.id.txt_date, dateStr);

        if (!data.isValid) {
            // Hide normal sections, show empty state
            views.setViewVisibility(R.id.txt_current_title, View.GONE);
            views.setViewVisibility(R.id.txt_next_step, View.GONE);
            views.setViewVisibility(R.id.btn_start_timer, View.GONE);
            views.setViewVisibility(R.id.txt_progress, View.GONE);
            views.setViewVisibility(R.id.progress_bar, View.GONE);
            views.setViewVisibility(R.id.txt_next_unlockable_title, View.GONE);
            views.setViewVisibility(R.id.txt_empty_state, View.VISIBLE);
            views.setTextViewText(R.id.txt_empty_state, "Abre Nudos para empezar");

            // Tap-to-open-app PendingIntent
            Intent appIntent = new Intent(context, MainActivity.class);
            appIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            PendingIntent appPendingIntent = PendingIntent.getActivity(
                    context, 0, appIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            views.setOnClickPendingIntent(R.id.txt_empty_state, appPendingIntent);

            return views;
        }

        // Data is valid — show normal sections, hide empty state
        views.setViewVisibility(R.id.txt_empty_state, View.GONE);
        views.setViewVisibility(R.id.txt_current_title, View.VISIBLE);
        views.setViewVisibility(R.id.txt_progress, View.VISIBLE);
        views.setViewVisibility(R.id.progress_bar, View.VISIBLE);
        views.setViewVisibility(R.id.txt_next_unlockable_title, View.VISIBLE);

        renderCurrentKnotSection(context, views, data);
        renderProgressSection(views, data);
        renderNextUnlockableSection(context, views, data);

        return views;
    }

    private void renderCurrentKnotSection(Context context, RemoteViews views, WidgetDataModel data) {
        if (data.currentKnot != null) {
            views.setTextViewText(R.id.txt_current_title, data.currentKnot.title);

            // Next step visibility
            if (data.currentKnot.nextStep != null) {
                views.setViewVisibility(R.id.txt_next_step, View.VISIBLE);
                views.setTextViewText(R.id.txt_next_step, data.currentKnot.nextStep);
            } else {
                views.setViewVisibility(R.id.txt_next_step, View.GONE);
            }

            // Timer button visible with PendingIntent
            // Use a trampoline Activity to guarantee foreground privileges on Android 12+
            views.setViewVisibility(R.id.btn_start_timer, View.VISIBLE);
            int timerSeconds = WidgetDataModel.computeTimerSeconds(data.currentKnot.estMinutes);
            Intent timerIntent = new Intent(context, TimerTrampolineActivity.class);
            timerIntent.putExtra("seconds", timerSeconds);
            timerIntent.putExtra("title", data.currentKnot.title);
            timerIntent.putExtra("knot_id", data.currentKnot.id);
            timerIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
            PendingIntent timerPendingIntent = PendingIntent.getActivity(
                    context, 1, timerIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            views.setOnClickPendingIntent(R.id.btn_start_timer, timerPendingIntent);
        } else {
            views.setTextViewText(R.id.txt_current_title, "Sin nudo activo");
            views.setViewVisibility(R.id.txt_next_step, View.GONE);
            views.setViewVisibility(R.id.btn_start_timer, View.GONE);
        }
    }

    private void renderProgressSection(RemoteViews views, WidgetDataModel data) {
        String progressText = WidgetDataModel.formatProgressText(data.doneTodayCount, data.dailyGoal);
        views.setTextViewText(R.id.txt_progress, progressText);

        int progressPercent = WidgetDataModel.computeProgressPercent(data.doneTodayCount, data.dailyGoal);
        views.setProgressBar(R.id.progress_bar, 100, progressPercent, false);

        if (WidgetDataModel.isGoalMet(data.doneTodayCount, data.dailyGoal)) {
            // Apply color change to indicate goal met
            views.setTextColor(R.id.txt_progress, 0xFF4CAF50); // Green text for goal met
        }
    }

    private void renderNextUnlockableSection(Context context, RemoteViews views, WidgetDataModel data) {
        if (data.nextUnlockable != null) {
            views.setTextViewText(R.id.txt_next_unlockable_title, data.nextUnlockable.title);

            // Deep-link PendingIntent
            Intent deepLinkIntent = new Intent(context, MainActivity.class);
            deepLinkIntent.setAction(ACTION_OPEN_KNOT);
            deepLinkIntent.putExtra("knot_id", data.nextUnlockable.id);
            deepLinkIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            PendingIntent deepLinkPendingIntent = PendingIntent.getActivity(
                    context, 2, deepLinkIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            views.setOnClickPendingIntent(R.id.txt_next_unlockable_title, deepLinkPendingIntent);
        } else {
            views.setTextViewText(R.id.txt_next_unlockable_title, "Nada desbloqueable");
        }
    }
}

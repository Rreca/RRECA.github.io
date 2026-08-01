package com.nudos.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public class WidgetTimerReceiver extends BroadcastReceiver {

    public static final String ACTION_START_TIMER = "com.nudos.app.ACTION_WIDGET_START_TIMER";

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

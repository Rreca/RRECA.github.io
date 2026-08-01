package com.example.app; // TODO: Change to your app's package name

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public class TimerCancelReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context context, Intent intent) {
        int remainingSeconds = intent.getIntExtra("remainingSeconds", 0);

        // Stop the foreground service
        Intent stopIntent = new Intent(context, TimerForegroundService.class);
        context.stopService(stopIntent);

        // Notify the plugin (which will relay to JS)
        TimerPlugin pluginInstance = TimerForegroundService.getPluginInstance();
        if (pluginInstance != null) {
            pluginInstance.fireTimerCancelled(remainingSeconds);
        }
    }
}

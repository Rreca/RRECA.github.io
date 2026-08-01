package com.example.app; // TODO: Change to your app's package name

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.CountDownTimer;
import android.os.IBinder;
import android.util.Log;

import androidx.core.app.NotificationCompat;

public class TimerForegroundService extends Service {

    private static final String TAG = "TimerForegroundService";
    private static final String CHANNEL_ID = "foreground_timer";
    private static final String COMPLETION_CHANNEL_ID = "foreground_timer_completion";
    private static final int NOTIFICATION_ID = 1001;
    private static final int COMPLETION_NOTIFICATION_ID = 1002;

    private static TimerPlugin pluginInstance;

    private CountDownTimer countDownTimer;
    private int totalSeconds;
    private int remainingSeconds;
    private String title;

    public static void setPluginInstance(TimerPlugin instance) {
        pluginInstance = instance;
    }

    public static TimerPlugin getPluginInstance() {
        return pluginInstance;
    }

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannels();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) {
            stopSelf();
            return START_NOT_STICKY;
        }

        int seconds = intent.getIntExtra("seconds", 0);
        title = intent.getStringExtra("title");
        if (title == null || title.isEmpty()) {
            title = "Timer";
        }

        totalSeconds = seconds;
        remainingSeconds = seconds;

        // Build the persistent notification
        Notification notification = buildNotification(remainingSeconds);
        startForeground(NOTIFICATION_ID, notification);

        // Start the countdown
        if (countDownTimer != null) {
            countDownTimer.cancel();
        }

        countDownTimer = new CountDownTimer(seconds * 1000L, 1000) {
            @Override
            public void onTick(long millisUntilFinished) {
                remainingSeconds = (int) (millisUntilFinished / 1000);
                updateNotification(remainingSeconds);
            }

            @Override
            public void onFinish() {
                onTimerFinish();
            }
        };
        countDownTimer.start();

        return START_NOT_STICKY;
    }

    @Override
    public void onDestroy() {
        super.onDestroy();

        if (countDownTimer != null) {
            countDownTimer.cancel();
            countDownTimer = null;
        }

        NotificationManager notificationManager =
                (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (notificationManager != null) {
            notificationManager.cancel(NOTIFICATION_ID);
        }
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private void createNotificationChannels() {
        // Ongoing countdown channel (silent)
        NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "Timer",
                NotificationManager.IMPORTANCE_HIGH
        );
        channel.setDescription("Active timer countdown notification");
        channel.setSound(null, null);
        channel.enableVibration(false);

        // Completion channel (with custom sound + vibration)
        NotificationChannel completionChannel = new NotificationChannel(
                COMPLETION_CHANNEL_ID,
                "Timer Completed",
                NotificationManager.IMPORTANCE_HIGH
        );
        completionChannel.setDescription("Sound and vibration when timer completes");
        Uri soundUri = Uri.parse("android.resource://" + getPackageName() + "/" +
                getResources().getIdentifier("timer_complete_chime", "raw", getPackageName()));
        AudioAttributes audioAttr = new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build();
        completionChannel.setSound(soundUri, audioAttr);
        completionChannel.enableVibration(true);
        completionChannel.setVibrationPattern(new long[]{ 0, 100, 80, 100, 80, 300 });

        NotificationManager notificationManager =
                (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (notificationManager != null) {
            notificationManager.createNotificationChannel(channel);
            notificationManager.createNotificationChannel(completionChannel);
        }
    }

    private Notification buildNotification(int secondsLeft) {
        String timeText = formatTime(secondsLeft) + " remaining";

        PendingIntent cancelPendingIntent = buildCancelPendingIntent(secondsLeft);

        return new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle(title)
                .setContentText(timeText)
                .setSmallIcon(android.R.drawable.ic_media_play)
                .setOngoing(true)
                .setSilent(true)
                .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Cancel", cancelPendingIntent)
                .build();
    }

    private void updateNotification(int secondsLeft) {
        Notification notification = buildNotification(secondsLeft);
        NotificationManager notificationManager =
                (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (notificationManager != null) {
            notificationManager.notify(NOTIFICATION_ID, notification);
        }
    }

    private PendingIntent buildCancelPendingIntent(int currentRemainingSeconds) {
        Intent cancelIntent = new Intent(this, TimerCancelReceiver.class);
        cancelIntent.putExtra("remainingSeconds", currentRemainingSeconds);
        return PendingIntent.getBroadcast(
                this,
                0,
                cancelIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }

    private void onTimerFinish() {
        // Post completion notification (sound + vibration handled by the channel)
        postCompletionNotification();

        // Notify plugin
        if (pluginInstance != null) {
            pluginInstance.fireTimerFinished(totalSeconds, title);
        }

        // Stop self
        stopSelf();
    }

    private void postCompletionNotification() {
        String durationText = formatTime(totalSeconds);
        String body = "Session of " + durationText + " — " + title;

        Notification notification = new NotificationCompat.Builder(this, COMPLETION_CHANNEL_ID)
                .setContentTitle("⏰ Timer finished")
                .setContentText(body)
                .setSmallIcon(android.R.drawable.ic_dialog_info)
                .setAutoCancel(true)
                .build();

        NotificationManager notificationManager =
                (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (notificationManager != null) {
            notificationManager.notify(COMPLETION_NOTIFICATION_ID, notification);
        }
    }

    private String formatTime(int totalSecs) {
        int minutes = totalSecs / 60;
        int seconds = totalSecs % 60;
        return String.format("%02d:%02d", minutes, seconds);
    }
}

package com.nudos.app;

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
    private static final String CHANNEL_ID = "nudos_timer_foreground";
    private static final String COMPLETION_CHANNEL_ID = "nudos_timer_completion";
    private static final int NOTIFICATION_ID = 1001;
    private static final int COMPLETION_NOTIFICATION_ID = 1002;

    private static TimerPlugin pluginInstance;
    private static TimerForegroundService instance;

    private CountDownTimer countDownTimer;
    private int totalSeconds;
    private int remainingSeconds;
    private String title;
    private String knotId;
    private boolean running;

    public static void setPluginInstance(TimerPlugin instance) {
        pluginInstance = instance;
    }

    public static TimerPlugin getPluginInstance() {
        return pluginInstance;
    }

    public static TimerForegroundService getInstance() {
        return instance;
    }

    public boolean isRunning() {
        return running;
    }

    public int getRemainingSeconds() {
        return remainingSeconds;
    }

    public int getTotalSeconds() {
        return totalSeconds;
    }

    public String getTitle() {
        return title;
    }

    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;
        createNotificationChannel();
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
            title = "Timer de enfoque";
        }
        knotId = intent.getStringExtra("knot_id");

        totalSeconds = seconds;
        remainingSeconds = seconds;

        // Build the persistent notification
        Notification notification = buildNotification(remainingSeconds);
        startForeground(NOTIFICATION_ID, notification);

        running = true;

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
        running = false;
        instance = null;

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

    private void createNotificationChannel() {
        NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "Timer de Enfoque",
                NotificationManager.IMPORTANCE_HIGH
        );
        channel.setDescription("Notificación activa durante el timer de enfoque");
        channel.setSound(null, null);
        channel.enableVibration(false);

        // Canal para la notificación de completación (con sonido custom)
        NotificationChannel completionChannel = new NotificationChannel(
                COMPLETION_CHANNEL_ID,
                "Timer Completado",
                NotificationManager.IMPORTANCE_HIGH
        );
        completionChannel.setDescription("Sonido cuando el timer de enfoque termina");
        Uri soundUri = Uri.parse("android.resource://" + getPackageName() + "/" + R.raw.timer_complete_chime);
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
        String timeText = formatTime(secondsLeft) + " restante(s)";

        PendingIntent cancelPendingIntent = buildCancelPendingIntent(secondsLeft);

        // Tap notification to open app in Focus mode
        Intent openAppIntent = new Intent(this, MainActivity.class);
        openAppIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        openAppIntent.putExtra("open_focus", true);
        if (knotId != null) {
            openAppIntent.putExtra("knot_id", knotId);
        }
        PendingIntent openAppPendingIntent = PendingIntent.getActivity(
                this, 99, openAppIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        return new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle(title)
                .setContentText(timeText)
                .setSmallIcon(android.R.drawable.ic_media_play)
                .setOngoing(true)
                .setSilent(true)
                .setContentIntent(openAppPendingIntent)
                .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Cancelar", cancelPendingIntent)
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
        String body = "Sesión de " + durationText + " — " + title;

        // Tap to open app
        Intent openAppIntent = new Intent(this, MainActivity.class);
        openAppIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent openAppPendingIntent = PendingIntent.getActivity(
                this, 100, openAppIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Notification notification = new NotificationCompat.Builder(this, COMPLETION_CHANNEL_ID)
                .setContentTitle("⏰ Timer terminado")
                .setContentText(body)
                .setSmallIcon(android.R.drawable.ic_dialog_info)
                .setContentIntent(openAppPendingIntent)
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

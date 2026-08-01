package com.nudos.app;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.media.RingtoneManager;
import android.net.Uri;
import android.media.Ringtone;
import android.os.Bundle;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;
import android.util.Log;

/**
 * Invisible trampoline Activity that starts the TimerForegroundService.
 * Widgets on Android 12+ cannot reliably start foreground services directly.
 * An Activity started from a PendingIntent has full foreground privileges,
 * so it can safely call startForegroundService().
 */
public class TimerTrampolineActivity extends Activity {

    private static final String TAG = "TimerTrampoline";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        int seconds = getIntent().getIntExtra("seconds", 300);
        String title = getIntent().getStringExtra("title");
        if (title == null || title.isEmpty()) {
            title = "Timer de enfoque";
        }

        Log.d(TAG, "Starting timer: " + seconds + "s, title=" + title);

        Intent serviceIntent = new Intent(this, TimerForegroundService.class);
        serviceIntent.putExtra("seconds", seconds);
        serviceIntent.putExtra("title", title);
        serviceIntent.putExtra("knot_id", getIntent().getStringExtra("knot_id"));

        try {
            startForegroundService(serviceIntent);
            // Haptic feedback: short vibration + sound to confirm timer started
            vibrateShort();
            playStartSound();
        } catch (Exception e) {
            Log.e(TAG, "Failed to start foreground service", e);
            // Fallback: open the main app
            Intent appIntent = new Intent(this, MainActivity.class);
            appIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(appIntent);
        }

        // Close immediately — no UI shown
        finish();
    }

    private void vibrateShort() {
        try {
            Vibrator vibrator;
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.S) {
                VibratorManager vm = (VibratorManager) getSystemService(Context.VIBRATOR_MANAGER_SERVICE);
                vibrator = vm.getDefaultVibrator();
            } else {
                vibrator = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
            }
            if (vibrator != null && vibrator.hasVibrator()) {
                vibrator.vibrate(VibrationEffect.createOneShot(80, VibrationEffect.DEFAULT_AMPLITUDE));
            }
        } catch (Exception e) {
            Log.w(TAG, "Vibration failed", e);
        }
    }

    private void playStartSound() {
        try {
            Uri sound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
            Ringtone ringtone = RingtoneManager.getRingtone(this, sound);
            if (ringtone != null) {
                ringtone.play();
            }
        } catch (Exception e) {
            Log.w(TAG, "Start sound failed", e);
        }
    }
}

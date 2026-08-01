package com.nudos.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import android.content.Intent;

@CapacitorPlugin(name = "TimerPlugin")
public class TimerPlugin extends Plugin {

    @Override
    public void load() {
        TimerForegroundService.setPluginInstance(this);
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        // onNewIntent also handled by MainActivity.saveFocusIntent
        // Emit event for warm-start case where TabsComponent is already listening
        if (intent != null && intent.getBooleanExtra("open_focus", false)) {
            String knotId = intent.getStringExtra("knot_id");
            if (knotId != null && !knotId.isEmpty()) {
                JSObject data = new JSObject();
                data.put("knotId", knotId);
                notifyListeners("openFocus", data);
            }
        }
    }

    @PluginMethod()
    public void start(PluginCall call) {
        int seconds = call.getInt("seconds", 0);
        String title = call.getString("title", "Timer de enfoque");

        if (seconds <= 0) {
            call.reject("Invalid duration: seconds must be greater than zero");
            return;
        }

        // Stop any existing timer first
        stopService();

        // Start foreground service
        Intent intent = new Intent(getContext(), TimerForegroundService.class);
        intent.putExtra("seconds", seconds);
        intent.putExtra("title", title);
        getContext().startForegroundService(intent);

        call.resolve();
    }

    @PluginMethod()
    public void stop(PluginCall call) {
        stopService();
        call.resolve();
    }

    @PluginMethod()
    public void getState(PluginCall call) {
        JSObject data = new JSObject();
        TimerForegroundService service = TimerForegroundService.getInstance();
        if (service != null && service.isRunning()) {
            data.put("running", true);
            data.put("remainingSeconds", service.getRemainingSeconds());
            data.put("totalSeconds", service.getTotalSeconds());
            data.put("title", service.getTitle());
        } else {
            data.put("running", false);
            data.put("remainingSeconds", 0);
            data.put("totalSeconds", 0);
            data.put("title", "");
        }
        call.resolve(data);
    }

    @PluginMethod()
    public void consumePendingFocus(PluginCall call) {
        JSObject data = new JSObject();
        // Read from SharedPreferences (written by MainActivity on new intent)
        android.content.SharedPreferences prefs = getContext()
            .getSharedPreferences("com.nudos.app.focus_intent", android.content.Context.MODE_PRIVATE);
        String knotId = prefs.getString("pending_knot_id", null);
        if (knotId != null && !knotId.isEmpty()) {
            data.put("pending", true);
            data.put("knotId", knotId);
            // Clear after consuming
            prefs.edit().remove("pending_knot_id").apply();
        } else {
            data.put("pending", false);
            data.put("knotId", "");
        }
        call.resolve(data);
    }

    private void stopService() {
        Intent intent = new Intent(getContext(), TimerForegroundService.class);
        getContext().stopService(intent);
    }

    // Called from TimerForegroundService via static reference
    public void fireTimerFinished(int elapsedSeconds, String title) {
        JSObject data = new JSObject();
        data.put("elapsedSeconds", elapsedSeconds);
        data.put("title", title);
        notifyListeners("timerFinished", data);
    }

    public void fireTimerCancelled(int remainingSeconds) {
        JSObject data = new JSObject();
        data.put("remainingSeconds", remainingSeconds);
        notifyListeners("timerCancelled", data);
    }
}

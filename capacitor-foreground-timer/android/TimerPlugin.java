package com.example.app; // TODO: Change to your app's package name

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

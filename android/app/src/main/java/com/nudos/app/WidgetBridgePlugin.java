package com.nudos.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;

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

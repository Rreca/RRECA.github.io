package com.nudos.app;

import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(TimerPlugin.class);
        registerPlugin(WidgetBridgePlugin.class);
        super.onCreate(savedInstanceState);
        saveFocusIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        saveFocusIntent(intent);
    }

    private void saveFocusIntent(Intent intent) {
        if (intent != null && intent.getBooleanExtra("open_focus", false)) {
            String knotId = intent.getStringExtra("knot_id");
            if (knotId != null && !knotId.isEmpty()) {
                SharedPreferences prefs = getSharedPreferences(
                    "com.nudos.app.focus_intent", MODE_PRIVATE);
                prefs.edit().putString("pending_knot_id", knotId).apply();
            }
            intent.removeExtra("open_focus");
        }
    }
}

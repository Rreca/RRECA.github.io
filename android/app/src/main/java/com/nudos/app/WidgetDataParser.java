package com.nudos.app;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONException;
import org.json.JSONObject;

/**
 * Pure utility that reads SharedPreferences and returns a typed WidgetDataModel.
 * Handles null/missing/invalid JSON gracefully by returning an empty model.
 */
public class WidgetDataParser {

    private static final String PREFS_NAME = "com.nudos.app.widget_data";
    private static final String KEY_DATA = "widget_json";

    /**
     * Reads the widget JSON from SharedPreferences and parses it into a WidgetDataModel.
     *
     * @param context Android context used to access SharedPreferences
     * @return parsed WidgetDataModel, or empty model if data is missing/invalid
     */
    public static WidgetDataModel parse(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String json = prefs.getString(KEY_DATA, null);
        return parseJson(json);
    }

    /**
     * Parses a JSON string into a WidgetDataModel.
     * Returns WidgetDataModel.empty() if json is null, empty, or invalid JSON.
     *
     * @param json the JSON string to parse (may be null)
     * @return parsed WidgetDataModel, or empty model if input is null/empty/invalid
     */
    public static WidgetDataModel parseJson(String json) {
        if (json == null || json.isEmpty()) {
            return WidgetDataModel.empty();
        }
        try {
            JSONObject obj = new JSONObject(json);
            return WidgetDataModel.fromJson(obj);
        } catch (JSONException e) {
            return WidgetDataModel.empty();
        }
    }
}

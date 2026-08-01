package com.nudos.app;

import org.json.JSONException;
import org.json.JSONObject;

public class WidgetDataModel {

    public final CurrentKnot currentKnot;
    public final NextUnlockable nextUnlockable;
    public final int doneTodayCount;
    public final int dailyGoal;
    public final boolean isValid;

    public WidgetDataModel(CurrentKnot currentKnot, NextUnlockable nextUnlockable,
                           int doneTodayCount, int dailyGoal, boolean isValid) {
        this.currentKnot = currentKnot;
        this.nextUnlockable = nextUnlockable;
        this.doneTodayCount = doneTodayCount;
        this.dailyGoal = dailyGoal;
        this.isValid = isValid;
    }

    public static WidgetDataModel empty() {
        return new WidgetDataModel(null, null, 0, 1, false);
    }

    public static WidgetDataModel fromJson(JSONObject obj) {
        CurrentKnot currentKnot = null;
        NextUnlockable nextUnlockable = null;
        int doneTodayCount = 0;
        int dailyGoal = 1;

        try {
            if (obj.has("currentKnot") && !obj.isNull("currentKnot")) {
                JSONObject knotObj = obj.getJSONObject("currentKnot");
                String id = knotObj.optString("id", "");
                String title = knotObj.optString("title", "");
                Integer estMinutes = knotObj.has("estMinutes") && !knotObj.isNull("estMinutes")
                        ? knotObj.getInt("estMinutes") : null;
                String nextStep = knotObj.has("nextStep") && !knotObj.isNull("nextStep")
                        ? knotObj.getString("nextStep") : null;
                currentKnot = new CurrentKnot(id, title, estMinutes, nextStep);
            }
        } catch (JSONException e) {
            currentKnot = null;
        }

        try {
            if (obj.has("nextUnlockable") && !obj.isNull("nextUnlockable")) {
                JSONObject unlockObj = obj.getJSONObject("nextUnlockable");
                String id = unlockObj.optString("id", "");
                String title = unlockObj.optString("title", "");
                nextUnlockable = new NextUnlockable(id, title);
            }
        } catch (JSONException e) {
            nextUnlockable = null;
        }

        doneTodayCount = obj.optInt("doneTodayCount", 0);
        dailyGoal = obj.optInt("dailyGoal", 1);

        return new WidgetDataModel(currentKnot, nextUnlockable, doneTodayCount, dailyGoal, true);
    }

    public static int computeTimerSeconds(Integer estMinutes) {
        if (estMinutes == null || estMinutes <= 0) {
            return 300;
        }
        return estMinutes * 60;
    }

    public static int computeProgressPercent(int doneTodayCount, int dailyGoal) {
        if (dailyGoal <= 0) return 0;
        int percent = (doneTodayCount * 100) / dailyGoal;
        return Math.min(percent, 100);
    }

    public static String formatProgressText(int doneTodayCount, int dailyGoal) {
        return doneTodayCount + "/" + dailyGoal;
    }

    public static boolean isGoalMet(int doneTodayCount, int dailyGoal) {
        return doneTodayCount >= dailyGoal;
    }

    public static class CurrentKnot {
        public final String id;
        public final String title;
        public final Integer estMinutes;
        public final String nextStep;

        public CurrentKnot(String id, String title, Integer estMinutes, String nextStep) {
            this.id = id;
            this.title = title;
            this.estMinutes = estMinutes;
            this.nextStep = nextStep;
        }
    }

    public static class NextUnlockable {
        public final String id;
        public final String title;

        public NextUnlockable(String id, String title) {
            this.id = id;
            this.title = title;
        }
    }
}

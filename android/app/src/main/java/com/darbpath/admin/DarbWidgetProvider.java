package com.darbpath.admin;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.widget.RemoteViews;
import android.widget.Toast;

import androidx.work.OneTimeWorkRequest;
import androidx.work.WorkManager;

public class DarbWidgetProvider extends AppWidgetProvider {

    private static final String ACTION_REFRESH_CLICK = "com.darbpath.admin.action.REFRESH_CLICK";

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        // Update all active widgets
        for (int appWidgetId : appWidgetIds) {
            updateAppWidget(context, appWidgetManager, appWidgetId);
        }
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);

        if (ACTION_REFRESH_CLICK.equals(intent.getAction())) {
            // Trigger manual check via background worker
            OneTimeWorkRequest oneTimeRequest = new OneTimeWorkRequest.Builder(DarbBackgroundWorker.class).build();
            WorkManager.getInstance(context).enqueue(oneTimeRequest);

            Toast.makeText(context, "جاري تحديث بيانات درب...", Toast.LENGTH_SHORT).show();
        }
    }

    static void updateAppWidget(Context context, AppWidgetManager appWidgetManager, int appWidgetId) {
        SharedPreferences prefs = context.getSharedPreferences("DarbPrefs", Context.MODE_PRIVATE);

        int views = prefs.getInt("cached_views", 0);
        int submits = prefs.getInt("cached_submits", 0);
        String convRate = prefs.getString("cached_conv_rate", "0%");

        // Construct RemoteViews object
        RemoteViews remoteViews = new RemoteViews(context.getPackageName(), R.layout.darb_widget);

        // Update layout text views
        remoteViews.setTextViewText(R.id.tvWidgetViews, views > 0 ? String.valueOf(views) : "-");
        remoteViews.setTextViewText(R.id.tvWidgetSubmits, submits > 0 ? String.valueOf(submits) : "-");
        remoteViews.setTextViewText(R.id.tvWidgetConvRate, convRate);

        // Set up pending intent for refresh button
        Intent refreshIntent = new Intent(context, DarbWidgetProvider.class);
        refreshIntent.setAction(ACTION_REFRESH_CLICK);
        PendingIntent pendingIntent = PendingIntent.getBroadcast(
                context,
                0,
                refreshIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        remoteViews.setOnClickPendingIntent(R.id.btnWidgetRefresh, pendingIntent);

        // Set up pending intent to open MainActivity when widget body is clicked
        Intent openAppIntent = new Intent(context, MainActivity.class);
        PendingIntent openAppPendingIntent = PendingIntent.getActivity(
                context,
                1,
                openAppIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        remoteViews.setOnClickPendingIntent(R.id.tvWidgetViews, openAppPendingIntent);
        remoteViews.setOnClickPendingIntent(R.id.tvWidgetSubmits, openAppPendingIntent);
        remoteViews.setOnClickPendingIntent(R.id.tvWidgetConvRate, openAppPendingIntent);

        // Tell AppWidgetManager to update the widget
        appWidgetManager.updateAppWidget(appWidgetId, remoteViews);
    }
}

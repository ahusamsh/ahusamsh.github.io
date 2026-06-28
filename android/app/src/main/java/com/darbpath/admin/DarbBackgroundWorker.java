package com.darbpath.admin;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.TaskStackBuilder;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;

import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;

public class DarbBackgroundWorker extends Worker {

    private static final String CHANNEL_ID = "DarbPathAdminNotifications";
    private static final String CHANNEL_NAME = "Darb Path Notifications";
    private static final int NOTIFICATION_ID = 1001;

    public DarbBackgroundWorker(@NonNull Context context, @NonNull WorkerParameters workerParams) {
        super(context, workerParams);
    }

    @NonNull
    @Override
    public Result doWork() {
        Context context = getApplicationContext();
        SharedPreferences prefs = context.getSharedPreferences("DarbPrefs", Context.MODE_PRIVATE);
        String scriptUrl = prefs.getString("script_url", "");

        if (scriptUrl.isEmpty()) {
            return Result.success();
        }

        try {
            // Fetch stats from Apps Script URL
            String requestUrlString = scriptUrl + "?action=getData&t=" + System.currentTimeMillis();
            URL url = new URL(requestUrlString);
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("GET");
            conn.setConnectTimeout(10000);
            conn.setReadTimeout(10000);

            int responseCode = conn.getResponseCode();
            if (responseCode == HttpURLConnection.HTTP_OK) {
                BufferedReader in = new BufferedReader(new InputStreamReader(conn.getInputStream()));
                StringBuilder response = new StringBuilder();
                String inputLine;

                while ((inputLine = in.readLine()) != null) {
                    response.append(inputLine);
                }
                in.close();

                // Parse stats
                JSONObject json = new JSONObject(response.toString());
                if (json.has("summary")) {
                    JSONObject summary = json.getJSONObject("summary");
                    int totalViews = summary.optInt("total_views", 0);
                    int totalSubmits = summary.optInt("total_form_submits", 0);
                    double convRate = totalViews > 0 ? ((double) totalSubmits / totalViews) * 100 : 0;
                    String convRateStr = String.format("%.1f%%", convRate);

                    // Save latest stats to SharedPreferences (for the Widget to read)
                    SharedPreferences.Editor editor = prefs.edit();
                    editor.putInt("cached_views", totalViews);
                    editor.putInt("cached_submits", totalSubmits);
                    editor.putString("cached_conv_rate", convRateStr);

                    // Check for new submissions
                    int lastSubmits = prefs.getInt("last_form_submits", -1);
                    if (lastSubmits != -1 && totalSubmits > lastSubmits) {
                        int diff = totalSubmits - lastSubmits;
                        showNotification(context, diff);
                    }
                    
                    editor.putInt("last_form_submits", totalSubmits);
                    editor.apply();

                    // Update App Widget
                    updateWidget(context);
                }
            }
            conn.disconnect();
            return Result.success();
        } catch (Exception e) {
            e.printStackTrace();
            return Result.retry();
        }
    }

    private void showNotification(Context context, int newRegistrationsCount) {
        NotificationManager notificationManager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(CHANNEL_ID, CHANNEL_NAME, NotificationManager.IMPORTANCE_HIGH);
            channel.setDescription("إشعارات التسجيلات الجديدة لبرنامج درب");
            notificationManager.createNotificationChannel(channel);
        }

        Intent resultIntent = new Intent(context, MainActivity.class);
        TaskStackBuilder stackBuilder = TaskStackBuilder.create(context);
        stackBuilder.addNextIntentWithParentStack(resultIntent);
        
        PendingIntent resultPendingIntent = stackBuilder.getPendingIntent(
                0,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        String message = newRegistrationsCount == 1 
                ? "يوجد طلب تسجيل جديد قيد المراجعة! 🕌"
                : "يوجد " + newRegistrationsCount + " طلبات تسجيل جديدة قيدة المراجعة! 🕌";

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(android.R.drawable.ic_dialog_info) // Fallback system icon, logo will be used in app metadata
                .setContentTitle("تسجيل جديد في درب | Path")
                .setContentText(message)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(message))
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setContentIntent(resultPendingIntent)
                .setAutoCancel(true);

        notificationManager.notify(NOTIFICATION_ID, builder.build());
    }

    private void updateWidget(Context context) {
        Intent intent = new Intent(context, DarbWidgetProvider.class);
        intent.setAction(AppWidgetManager.ACTION_APPWIDGET_UPDATE);
        
        int[] ids = AppWidgetManager.getInstance(context).getAppWidgetIds(
                new ComponentName(context, DarbWidgetProvider.class)
        );
        intent.putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids);
        context.sendBroadcast(intent);
    }
}

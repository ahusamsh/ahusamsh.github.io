package com.darbpath.admin;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;

import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;

import java.util.concurrent.TimeUnit;

public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) {
            SharedPreferences prefs = context.getSharedPreferences("DarbPrefs", Context.MODE_PRIVATE);
            String scriptUrl = prefs.getString("script_url", "");
            if (!scriptUrl.isEmpty()) {
                PeriodicWorkRequest checkRequest = new PeriodicWorkRequest.Builder(
                        DarbBackgroundWorker.class,
                        15, TimeUnit.MINUTES)
                        .addTag("DarbNewRegCheck")
                        .build();

                WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                        "DarbNewRegCheckUnique",
                        ExistingPeriodicWorkPolicy.KEEP,
                        checkRequest);
            }
        }
    }
}

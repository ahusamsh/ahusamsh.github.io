package com.darbpath.admin;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.view.View;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.ScrollView;
import android.widget.Toast;

import androidx.appcompat.app.AppCompatActivity;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;

import com.google.android.material.bottomnavigation.BottomNavigationView;

import java.util.concurrent.TimeUnit;

public class MainActivity extends AppCompatActivity {

    private WebView webView;
    private ScrollView settingsContainer;
    private EditText etScriptUrl, etGithubToken;
    private Button btnSaveSettings;
    private BottomNavigationView bottomNavigationView;

    private SharedPreferences sharedPreferences;
    private String currentTab = "analytics";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        sharedPreferences = getSharedPreferences("DarbPrefs", Context.MODE_PRIVATE);

        // Initialize Views
        webView = findViewById(R.id.webView);
        settingsContainer = findViewById(R.id.settingsContainer);
        etScriptUrl = findViewById(R.id.etScriptUrl);
        etGithubToken = findViewById(R.id.etGithubToken);
        btnSaveSettings = findViewById(R.id.btnSaveSettings);
        bottomNavigationView = findViewById(R.id.bottomNavigationView);

        setupWebView();

        // Load Settings form values
        etScriptUrl.setText(sharedPreferences.getString("script_url", ""));
        etGithubToken.setText(sharedPreferences.getString("github_token", ""));

        // Save Settings logic
        btnSaveSettings.setOnClickListener(v -> {
            String url = etScriptUrl.getText().toString().trim();
            String token = etGithubToken.getText().toString().trim();

            SharedPreferences.Editor editor = sharedPreferences.edit();
            editor.putString("script_url", url);
            editor.putString("github_token", token);
            editor.apply();

            Toast.makeText(MainActivity.this, "تم حفظ الإعدادات بنجاح!", Toast.LENGTH_SHORT).show();

            // Restart worker to use new URL
            startBackgroundWorker(true);

            // Return to analytics tab
            bottomNavigationView.setSelectedItemId(R.id.navigation_analytics);
        });

        // Bottom Navigation Logic
        bottomNavigationView.setOnItemSelectedListener(item -> {
            int itemId = item.getItemId();
            if (itemId == R.id.navigation_analytics) {
                currentTab = "analytics";
                settingsContainer.setVisibility(View.GONE);
                webView.setVisibility(View.VISIBLE);
                
                String scriptUrl = sharedPreferences.getString("script_url", "");
                if (scriptUrl.isEmpty()) {
                    Toast.makeText(this, "يرجى ضبط رابط السكربت أولاً في الإعدادات", Toast.LENGTH_LONG).show();
                    bottomNavigationView.setSelectedItemId(R.id.navigation_settings);
                } else {
                    webView.loadUrl("file:///android_asset/analytics.html");
                }
                return true;
            } else if (itemId == R.id.navigation_referrals) {
                currentTab = "referrals";
                settingsContainer.setVisibility(View.GONE);
                webView.setVisibility(View.VISIBLE);

                String token = sharedPreferences.getString("github_token", "");
                if (token.isEmpty()) {
                    Toast.makeText(this, "يرجى ضبط رمز الوصول GitHub Token أولاً في الإعدادات", Toast.LENGTH_LONG).show();
                    bottomNavigationView.setSelectedItemId(R.id.navigation_settings);
                } else {
                    webView.loadUrl("file:///android_asset/860271.html");
                }
                return true;
            } else if (itemId == R.id.navigation_settings) {
                currentTab = "settings";
                webView.setVisibility(View.GONE);
                settingsContainer.setVisibility(View.VISIBLE);
                
                etScriptUrl.setText(sharedPreferences.getString("script_url", ""));
                etGithubToken.setText(sharedPreferences.getString("github_token", ""));
                return true;
            }
            return false;
        });

        // Default tab on launch
        String savedUrl = sharedPreferences.getString("script_url", "");
        if (savedUrl.isEmpty()) {
            bottomNavigationView.setSelectedItemId(R.id.navigation_settings);
        } else {
            bottomNavigationView.setSelectedItemId(R.id.navigation_analytics);
            startBackgroundWorker(false);
        }
    }

    private void setupWebView() {
        WebSettings ws = webView.getSettings();
        ws.setJavaScriptEnabled(true);
        ws.setDomStorageEnabled(true);
        
        // Allow CORS for local files to make fetch requests to Google Sheets / GitHub
        ws.setAllowFileAccess(true);
        ws.setAllowContentAccess(true);
        ws.setAllowFileAccessFromFileURLs(true);
        ws.setAllowUniversalAccessFromFileURLs(true);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                
                String scriptUrl = sharedPreferences.getString("script_url", "");
                String token = sharedPreferences.getString("github_token", "");

                if (url.contains("analytics.html") && !scriptUrl.isEmpty()) {
                    // Inject URL to local storage and trigger login
                    String js = "localStorage.setItem('darb_analytics_script', '" + scriptUrl + "');" +
                            "if(typeof login === 'function') { login(); }";
                    view.evaluateJavascript(js, null);
                } else if (url.contains("860271.html") && !token.isEmpty()) {
                    // Inject Token to local storage and trigger panel show
                    String js = "localStorage.setItem('darb-admin-token', '" + token + "');" +
                            "if(typeof showPanel === 'function') { showPanel(); }";
                    view.evaluateJavascript(js, null);
                }
            }
        });
    }

    private void startBackgroundWorker(boolean forceReplace) {
        PeriodicWorkRequest checkRequest = new PeriodicWorkRequest.Builder(
                DarbBackgroundWorker.class,
                15, TimeUnit.MINUTES)
                .addTag("DarbNewRegCheck")
                .build();

        WorkManager.getInstance(this).enqueueUniquePeriodicWork(
                "DarbNewRegCheckUnique",
                forceReplace ? ExistingPeriodicWorkPolicy.REPLACE : ExistingPeriodicWorkPolicy.KEEP,
                checkRequest);
    }
}

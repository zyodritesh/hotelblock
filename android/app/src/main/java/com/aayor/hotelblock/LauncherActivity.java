package com.aayor.hotelblock;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.Manifest;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.media.Ringtone;
import android.media.RingtoneManager;
import android.webkit.JavascriptInterface;
import org.json.JSONObject;
import android.view.ViewGroup;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import android.webkit.CookieManager;
import android.webkit.GeolocationPermissions;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;

/**
 * Opens HotelBlock inside the app. This does not hand the screen to Chrome,
 * so the window stays up even when Custom Tabs cannot start.
 */
public class LauncherActivity extends Activity {
    static volatile boolean inForeground = false;
    private static LauncherActivity instance;
    private static final int MIC_REQUEST = 42;
    private WebView webView;
    private String pendingAccept;
    private ValueCallback<Uri[]> fileCallback;
    private PermissionRequest pendingWebPermission;
    private Ringtone ringTone;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        webView = new WebView(this);
        webView.setBackgroundColor(0xFFF8FAFC);
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(0xFF0F172A);
        root.addView(webView, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(root);
        ViewCompat.setOnApplyWindowInsetsListener(root, (view, windowInsets) -> {
            Insets bars = windowInsets.getInsets(WindowInsetsCompat.Type.systemBars());
            view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
            return WindowInsetsCompat.CONSUMED;
        });
        root.post(() -> ViewCompat.requestApplyInsets(root));

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setUserAgentString(settings.getUserAgentString() + " HotelBlockApp");
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true);

        webView.addJavascriptInterface(new NativeBridge(), "HotelBlockNative");
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                pumpAccept(0);
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return openOutsideApp(request.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return openOutsideApp(Uri.parse(url));
            }
        });
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(PermissionRequest request) {
                runOnUiThread(() -> grantWebPermission(request));
            }

            @Override
            public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
                callback.invoke(origin, true, false);
            }

            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                try {
                    startActivityForResult(params.createIntent(), 1001);
                    return true;
                } catch (ActivityNotFoundException e) {
                    fileCallback = null;
                    return false;
                }
            }
        });

        if (Build.VERSION.SDK_INT >= 33) {
            java.util.ArrayList<String> needed = new java.util.ArrayList<>();
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                needed.add(Manifest.permission.POST_NOTIFICATIONS);
            }
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
                needed.add(Manifest.permission.RECORD_AUDIO);
            }
            if (!needed.isEmpty()) requestPermissions(needed.toArray(new String[0]), 1);
        } else if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(this, new String[]{Manifest.permission.RECORD_AUDIO}, 1);
        }
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationManager manager = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            if (manager != null) {
                manager.createNotificationChannel(new NotificationChannel(
                        "hotelblock", "HotelBlock", NotificationManager.IMPORTANCE_DEFAULT));
            }
        }

        String accept = getIntent() == null ? null : getIntent().getStringExtra("accept_call");
        if (accept != null) pendingAccept = accept;
        webView.loadUrl(startUrl());
    }

    static void tellWeb(Context context, String js) {
        LauncherActivity activity = instance;
        if (activity == null || activity.webView == null) return;
        activity.runOnUiThread(() -> activity.webView.evaluateJavascript(js, null));
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        String accept = intent == null ? null : intent.getStringExtra("accept_call");
        if (accept != null) pendingAccept = accept;
        pumpAccept(0);
    }

    @Override
    protected void onResume() {
        super.onResume();
        instance = this;
        inForeground = true;
        pumpAccept(0);
    }

    @Override
    protected void onPause() {
        inForeground = false;
        super.onPause();
    }

    private void pumpAccept(int attempt) {
        if (pendingAccept == null || webView == null) return;
        String id = pendingAccept;
        String js = "(function(){if(window.__hbAcceptCall){window.__hbAcceptCall(" + JSONObject.quote(id) + ");return true;}return false;})()";
        webView.evaluateJavascript(js, value -> {
            if ("true".equals(value)) pendingAccept = null;
            else if (attempt < 20) webView.postDelayed(() -> pumpAccept(attempt + 1), 300);
        });
    }

    private String startUrl() {
        String home = getString(R.string.launchUrl);
        Uri data = getIntent() == null ? null : getIntent().getData();
        if (data != null && "https".equals(data.getScheme()) && data.getHost() != null
                && data.getHost().equals(Uri.parse(home).getHost())) {
            return data.toString();
        }
        return home;
    }

    private boolean openOutsideApp(Uri uri) {
        String scheme = uri.getScheme() == null ? "" : uri.getScheme();
        if ("tel".equals(scheme)) {
            openDialer(uri.getSchemeSpecificPart());
            return true;
        }
        if ("http".equals(scheme) || "https".equals(scheme)) {
            String host = uri.getHost() == null ? "" : uri.getHost();
            String homeHost = Uri.parse(getString(R.string.launchUrl)).getHost();
            if (homeHost != null && homeHost.equals(host)) return false;
            if ("wa.me".equals(host) || "api.whatsapp.com".equals(host)) {
                openWhatsApp(uri.getLastPathSegment());
                return true;
            }
        }
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (ActivityNotFoundException e) {
            Toast.makeText(this, "That link could not be opened", Toast.LENGTH_SHORT).show();
        }
        return true;
    }

    private void openDialer(String number) {
        String cleaned = number == null ? "" : number.replaceAll("[^0-9+]", "");
        if (cleaned.isEmpty()) return;
        try {
            startActivity(new Intent(Intent.ACTION_DIAL, Uri.parse("tel:" + cleaned)));
        } catch (ActivityNotFoundException e) {
            Toast.makeText(this, "No phone app found on this device", Toast.LENGTH_SHORT).show();
        }
    }

    private void openWhatsApp(String number) {
        String digits = number == null ? "" : number.replaceAll("\\D", "");
        if (digits.isEmpty()) return;
        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse("https://wa.me/" + digits));
        intent.setPackage("com.whatsapp");
        try {
            startActivity(intent);
        } catch (ActivityNotFoundException missing) {
            intent.setPackage(null);
            try {
                startActivity(intent);
            } catch (ActivityNotFoundException e) {
                Toast.makeText(this, "WhatsApp is not installed", Toast.LENGTH_SHORT).show();
            }
        }
    }

    private void grantWebPermission(PermissionRequest request) {
        boolean needsMic = false;
        for (String resource : request.getResources()) {
            if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource)) needsMic = true;
        }
        if (needsMic && ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            pendingWebPermission = request;
            ActivityCompat.requestPermissions(this, new String[]{Manifest.permission.RECORD_AUDIO}, MIC_REQUEST);
            return;
        }
        request.grant(request.getResources());
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode != MIC_REQUEST || pendingWebPermission == null) return;
        boolean allowed = grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED;
        if (allowed) pendingWebPermission.grant(pendingWebPermission.getResources());
        else pendingWebPermission.deny();
        pendingWebPermission = null;
    }

    private class NativeBridge {
        @JavascriptInterface
        public void dial(String number) {
            runOnUiThread(() -> openDialer(number));
        }

        @JavascriptInterface
        public void whatsapp(String number) {
            runOnUiThread(() -> openWhatsApp(number));
        }

        @JavascriptInterface
        public void armCalls(String token) {
            CallWatchService.arm(LauncherActivity.this, token);
        }

        @JavascriptInterface
        public String deviceInfo() {
            try {
                JSONObject info = new JSONObject();
                info.put("id", CallWatchService.deviceId(LauncherActivity.this));
                info.put("label", CallWatchService.deviceLabel());
                info.put("version", CallWatchService.appVersion(LauncherActivity.this));
                return info.toString();
            } catch (Exception ignored) {
                return "{}";
            }
        }

        @JavascriptInterface
        public void stopCalls() {
            CallWatchService.stop(LauncherActivity.this);
        }

        @JavascriptInterface
        public void callScreen(boolean open) {
            runOnUiThread(() -> {
                if (Build.VERSION.SDK_INT >= 27) {
                    setShowWhenLocked(open);
                    setTurnScreenOn(open);
                }
                if (!open) applyAudio("off");
            });
        }

        @JavascriptInterface
        public void callAudio(String mode) {
            runOnUiThread(() -> applyAudio(mode == null ? "off" : mode));
        }
    }

    private void applyAudio(String mode) {
        AudioManager audio = (AudioManager) getSystemService(AUDIO_SERVICE);
        if (audio == null) return;
        if ("incoming".equals(mode)) {
            audio.setMode(AudioManager.MODE_RINGTONE);
            audio.setSpeakerphoneOn(true);
            startRing();
            return;
        }
        stopRing();
        if ("ring".equals(mode) || "speaker".equals(mode)) {
            audio.setMode("ring".equals(mode) ? AudioManager.MODE_RINGTONE : AudioManager.MODE_IN_COMMUNICATION);
            audio.setSpeakerphoneOn(true);
        } else if ("earpiece".equals(mode)) {
            audio.setMode(AudioManager.MODE_IN_COMMUNICATION);
            audio.setSpeakerphoneOn(false);
        } else {
            audio.setMode(AudioManager.MODE_NORMAL);
            audio.setSpeakerphoneOn(false);
        }
    }

    private void startRing() {
        if (ringTone != null && ringTone.isPlaying()) return;
        Uri uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
        if (uri == null) uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
        ringTone = RingtoneManager.getRingtone(getApplicationContext(), uri);
        if (ringTone == null) return;
        ringTone.setAudioAttributes(new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                .build());
        if (Build.VERSION.SDK_INT >= 28) ringTone.setLooping(true);
        ringTone.play();
    }

    private void stopRing() {
        if (ringTone != null && ringTone.isPlaying()) ringTone.stop();
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == 1001 && fileCallback != null) {
            fileCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data));
            fileCallback = null;
        }
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        stopRing();
        if (instance == this) instance = null;
        if (webView != null) webView.destroy();
        super.onDestroy();
    }
}

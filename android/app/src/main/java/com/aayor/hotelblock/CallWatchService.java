package com.aayor.hotelblock;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import android.provider.Settings;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

/**
 * Keeps a light watch for team calls so the phone can show an incoming call
 * when HotelBlock is not the screen in front.
 */
public class CallWatchService extends Service {
    static final String PREFS = "hotelblock_calls";
    static final String CALL_CHANNEL = "hotelblock_calls";
    private static final String READY_CHANNEL = "hotelblock_ready";
    private static final int READY_ID = 41;
    private static final int CALL_ID = 42;
    private static String shownId = "";

    private final ScheduledExecutorService clock = Executors.newSingleThreadScheduledExecutor();

    static void arm(Context context, String token) {
        Context app = context.getApplicationContext();
        app.getSharedPreferences(PREFS, MODE_PRIVATE).edit().putString("token", token == null ? "" : token).apply();
        Intent intent = new Intent(app, CallWatchService.class);
        if (Build.VERSION.SDK_INT >= 26) context.startForegroundService(intent);
        else context.startService(intent);
        askForLockScreenCalls(app);
    }

    static void stop(Context context) {
        Context app = context.getApplicationContext();
        app.getSharedPreferences(PREFS, MODE_PRIVATE).edit().remove("token").apply();
        app.stopService(new Intent(app, CallWatchService.class));
    }

    static void accept(Context context, String id) {
        Intent open = new Intent(context, LauncherActivity.class);
        open.putExtra("accept_call", id);
        open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        context.startActivity(open);
        IncomingCallActivity.finishIfShowing();
        cancelCall(context);
    }

    static void decline(Context context, String id) {
        IncomingCallActivity.finishIfShowing();
        cancelCall(context);
        LauncherActivity.tellWeb(context, "window.__hbDeclineCall && window.__hbDeclineCall(" + JSONObject.quote(id) + ")");
        final String token = context.getSharedPreferences(PREFS, MODE_PRIVATE).getString("token", "");
        final String origin = origin(context);
        new Thread(() -> post(origin + "/api/team-calls/" + id + "/decline", token)).start();
    }

    private static void cancelCall(Context context) {
        NotificationManager manager = (NotificationManager) context.getSystemService(NOTIFICATION_SERVICE);
        if (manager != null) manager.cancel(CALL_ID);
    }

    private static void askForLockScreenCalls(Context context) {
        if (Build.VERSION.SDK_INT < 34) return;
        NotificationManager manager = (NotificationManager) context.getSystemService(NOTIFICATION_SERVICE);
        if (manager == null || manager.canUseFullScreenIntent()) return;
        if (context.getSharedPreferences(PREFS, MODE_PRIVATE).getBoolean("asked_fullscreen", false)) return;
        context.getSharedPreferences(PREFS, MODE_PRIVATE).edit().putBoolean("asked_fullscreen", true).apply();
        Intent settings = new Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT);
        settings.setData(Uri.parse("package:" + context.getPackageName()));
        settings.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try { context.startActivity(settings); } catch (Exception ignored) { /* the call screen still opens from the app */ }
    }

    @Override
    public void onCreate() {
        super.onCreate();
        createChannels();
        clock.scheduleWithFixedDelay(this::poll, 1, 2, TimeUnit.SECONDS);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        Notification ready = readyNotification();
        if (Build.VERSION.SDK_INT >= 34) {
            startForeground(READY_ID, ready, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
        } else {
            startForeground(READY_ID, ready);
        }
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        clock.shutdownNow();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private void createChannels() {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager manager = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (manager == null) return;
        NotificationChannel ready = new NotificationChannel(READY_CHANNEL, "Team calls", NotificationManager.IMPORTANCE_MIN);
        ready.setDescription("HotelBlock stays ready for a team call");
        manager.createNotificationChannel(ready);
        NotificationChannel calls = new NotificationChannel(CALL_CHANNEL, "Incoming team calls", NotificationManager.IMPORTANCE_HIGH);
        calls.setDescription("Shows a team call even when HotelBlock is not open");
        calls.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        calls.enableVibration(true);
        calls.setBypassDnd(false);
        Uri ringtone = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
        calls.setSound(ringtone, new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build());
        manager.createNotificationChannel(calls);
    }

    private Notification readyNotification() {
        Notification.Builder builder = Build.VERSION.SDK_INT >= 26
                ? new Notification.Builder(this, READY_CHANNEL)
                : new Notification.Builder(this);
        return builder
                .setSmallIcon(R.drawable.ic_notification_icon)
                .setContentTitle("HotelBlock")
                .setContentText("Ready for team calls")
                .setOngoing(true)
                .build();
    }

    private void poll() {
        String token = getSharedPreferences(PREFS, MODE_PRIVATE).getString("token", "");
        if (token == null || token.isEmpty()) return;
        try {
            HttpURLConnection conn = (HttpURLConnection) new URL(origin(this) + "/api/team-calls/incoming").openConnection();
            conn.setConnectTimeout(4000);
            conn.setReadTimeout(4000);
            conn.setRequestProperty("Authorization", "Bearer " + token);
            int code = conn.getResponseCode();
            String body = read(code >= 400 ? conn.getErrorStream() : conn.getInputStream());
            conn.disconnect();
            if (code == 401 || body == null) return;
            String trimmed = body.trim();
            if (trimmed.isEmpty() || "null".equals(trimmed)) {
                shownId = "";
                cancelCall(this);
                IncomingCallActivity.finishIfShowing();
                return;
            }
            JSONObject call = new JSONObject(trimmed);
            String id = call.optString("id", "");
            if (id.isEmpty()) return;
            String name = call.optString("from_name", "Teammate");
            if (call.optBoolean("is_group") && call.optString("title").length() > 0) name = call.optString("title");
            showIncoming(id, name);
        } catch (Exception ignored) { /* the next poll tries again */ }
    }

    private void showIncoming(String id, String name) {
        if (id.equals(shownId)) return;
        PowerManager power = (PowerManager) getSystemService(POWER_SERVICE);
        boolean screenOn = power != null && power.isInteractive();
        if (LauncherActivity.inForeground && screenOn) return;
        shownId = id;
        Intent full = new Intent(this, IncomingCallActivity.class);
        full.putExtra("call_id", id);
        full.putExtra("caller", name);
        full.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent fullScreen = PendingIntent.getActivity(this, 7, full, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Intent accept = new Intent(this, CallActionReceiver.class).setAction("accept").putExtra("call_id", id);
        Intent decline = new Intent(this, CallActionReceiver.class).setAction("decline").putExtra("call_id", id);
        PendingIntent acceptPi = PendingIntent.getBroadcast(this, 8, accept, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        PendingIntent declinePi = PendingIntent.getBroadcast(this, 9, decline, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder builder = Build.VERSION.SDK_INT >= 26
                ? new Notification.Builder(this, CALL_CHANNEL)
                : new Notification.Builder(this);
        Notification note = builder
                .setSmallIcon(R.drawable.ic_notification_icon)
                .setContentTitle(name)
                .setContentText("Incoming team call")
                .setCategory(Notification.CATEGORY_CALL)
                .setOngoing(true)
                .setVisibility(Notification.VISIBILITY_PUBLIC)
                .setFullScreenIntent(fullScreen, true)
                .setContentIntent(fullScreen)
                .addAction(new Notification.Action.Builder(null, "Decline", declinePi).build())
                .addAction(new Notification.Action.Builder(null, "Accept", acceptPi).build())
                .build();
        NotificationManager manager = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (manager != null) manager.notify(CALL_ID, note);
        try { startActivity(full); } catch (Exception ignored) { /* the full-screen notification opens it */ }
    }

    static String origin(Context context) {
        Uri launch = Uri.parse(context.getString(R.string.launchUrl));
        return launch.getScheme() + "://" + launch.getHost();
    }

    private static void post(String url, String token) {
        if (token == null || token.isEmpty()) return;
        try {
            HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
            conn.setRequestMethod("POST");
            conn.setConnectTimeout(4000);
            conn.setReadTimeout(4000);
            conn.setRequestProperty("Authorization", "Bearer " + token);
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setDoOutput(true);
            conn.getOutputStream().write("{}".getBytes());
            conn.getResponseCode();
            conn.disconnect();
        } catch (Exception ignored) { /* the web app also declines if it is open */ }
    }

    private static String read(InputStream stream) throws Exception {
        if (stream == null) return "";
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buf = new byte[2048];
        int n;
        while ((n = stream.read(buf)) >= 0) out.write(buf, 0, n);
        return out.toString();
    }
}

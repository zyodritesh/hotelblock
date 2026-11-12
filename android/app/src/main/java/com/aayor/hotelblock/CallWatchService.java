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
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import android.provider.Settings;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.util.HashSet;
import java.util.UUID;
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
    private static final String MESSAGE_CHANNEL = "hotelblock_messages";
    private static final int READY_ID = 41;
    private static final int CALL_ID = 42;
    private static String shownId = "";
    private int alertTick = 0;
    private final HashSet<String> shownAlerts = new HashSet<>();

    private final ScheduledExecutorService clock = Executors.newSingleThreadScheduledExecutor();

    static String deviceId(Context context) {
        android.content.SharedPreferences prefs = context.getSharedPreferences(PREFS, MODE_PRIVATE);
        String id = prefs.getString("device_id", "");
        if (id == null || id.isEmpty()) {
            id = UUID.randomUUID().toString();
            prefs.edit().putString("device_id", id).apply();
        }
        return id;
    }

    static String deviceLabel() {
        String maker = Build.MANUFACTURER == null ? "" : Build.MANUFACTURER;
        String model = Build.MODEL == null ? "Android" : Build.MODEL;
        if (model.toLowerCase().startsWith(maker.toLowerCase())) return model;
        return (maker + " " + model).trim();
    }

    static String appVersion(Context context) {
        try {
            String version = context.getPackageManager().getPackageInfo(context.getPackageName(), 0).versionName;
            return version == null ? "" : version;
        } catch (PackageManager.NameNotFoundException ignored) {
            return "";
        }
    }

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
        NotificationChannel messages = new NotificationChannel(MESSAGE_CHANNEL, "HotelBlock messages", NotificationManager.IMPORTANCE_HIGH);
        messages.setDescription("Rates, offers, and messages sent from HotelBlock");
        messages.enableVibration(true);
        manager.createNotificationChannel(messages);
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
            if (code != 401 && body != null) {
                String trimmed = body.trim();
                if (trimmed.isEmpty() || "null".equals(trimmed)) {
                    shownId = "";
                    cancelCall(this);
                    IncomingCallActivity.finishIfShowing();
                } else {
                    JSONObject call = new JSONObject(trimmed);
                    String id = call.optString("id", "");
                    if (!id.isEmpty()) {
                        String name = call.optString("from_name", "Teammate");
                        if (call.optBoolean("is_group") && call.optString("title").length() > 0) name = call.optString("title");
                        showIncoming(id, name);
                    }
                }
            }
        } catch (Exception ignored) { /* the next poll tries again */ }
        pollAlert();
    }

    private void pollAlert() {
        alertTick += 1;
        String token = getSharedPreferences(PREFS, MODE_PRIVATE).getString("token", "");
        if (token == null || token.isEmpty()) return;
        String device = deviceId(this);
        if (alertTick % 15 == 1) {
            try {
                JSONObject ping = new JSONObject();
                ping.put("id", device);
                ping.put("label", deviceLabel());
                ping.put("version", appVersion(this));
                postJson(origin(this) + "/api/devices/ping", token, ping.toString());
            } catch (Exception ignored) { /* the web page also registers the phone */ }
        }
        try {
            String encoded = URLEncoder.encode(device, "UTF-8");
            HttpURLConnection conn = (HttpURLConnection) new URL(origin(this) + "/api/devices/pending?device=" + encoded).openConnection();
            conn.setConnectTimeout(4000);
            conn.setReadTimeout(4000);
            conn.setRequestProperty("Authorization", "Bearer " + token);
            int code = conn.getResponseCode();
            String body = read(code >= 400 ? conn.getErrorStream() : conn.getInputStream());
            conn.disconnect();
            if (code != 200 || body == null || body.trim().isEmpty()) return;
            JSONObject payload = new JSONObject(body);
            if (payload.isNull("alert")) return;
            JSONObject alert = payload.getJSONObject("alert");
            String id = alert.optString("id", "");
            if (id.isEmpty() || shownAlerts.contains(id)) return;
            shownAlerts.add(id);
            showMessage(id, alert.optString("title", "HotelBlock"), alert.optString("body", ""));
            if (!postJson(origin(this) + "/api/devices/pending/" + id + "/seen", token, "{}")) shownAlerts.remove(id);
        } catch (Exception ignored) { /* the next poll tries again */ }
    }

    private void showMessage(String id, String title, String body) {
        Intent open = new Intent(this, LauncherActivity.class);
        open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent openPi = PendingIntent.getActivity(this, 20 + Math.abs(id.hashCode() % 50), open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder builder = Build.VERSION.SDK_INT >= 26
                ? new Notification.Builder(this, MESSAGE_CHANNEL)
                : new Notification.Builder(this);
        Notification note = builder
                .setSmallIcon(R.drawable.ic_notification_icon)
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(new Notification.BigTextStyle().bigText(body))
                .setAutoCancel(true)
                .setContentIntent(openPi)
                .build();
        NotificationManager manager = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (manager != null) manager.notify(1000 + Math.abs(id.hashCode() % 8000), note);
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
        postJson(url, token, "{}");
    }

    private static boolean postJson(String url, String token, String json) {
        if (token == null || token.isEmpty()) return false;
        try {
            HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
            conn.setRequestMethod("POST");
            conn.setConnectTimeout(4000);
            conn.setReadTimeout(4000);
            conn.setRequestProperty("Authorization", "Bearer " + token);
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setDoOutput(true);
            byte[] bytes = json.getBytes();
            conn.setFixedLengthStreamingMode(bytes.length);
            OutputStream out = conn.getOutputStream();
            out.write(bytes);
            out.close();
            int code = conn.getResponseCode();
            conn.disconnect();
            return code >= 200 && code < 300;
        } catch (Exception ignored) {
            return false;
        }
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

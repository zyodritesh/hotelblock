package com.aayor.hotelblock;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public class CallActionReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        String id = intent.getStringExtra("call_id");
        if (id == null || id.isEmpty()) return;
        if ("accept".equals(intent.getAction())) CallWatchService.accept(context, id);
        else if ("decline".equals(intent.getAction())) CallWatchService.decline(context, id);
    }
}

package com.aayor.hotelblock;

import android.app.Activity;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Bundle;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

/**
 * Full-screen incoming team call. It opens over the lock screen so a call
 * is visible even when HotelBlock itself is not.
 */
public class IncomingCallActivity extends Activity {
    private static IncomingCallActivity current;

    static void finishIfShowing() {
        IncomingCallActivity activity = current;
        if (activity != null) activity.runOnUiThread(activity::finish);
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        current = this;
        if (Build.VERSION.SDK_INT >= 27) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
        } else {
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
                    | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
                    | WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        }
        String callId = getIntent().getStringExtra("call_id");
        String caller = getIntent().getStringExtra("caller");
        if (caller == null || caller.isEmpty()) caller = "Teammate";

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER_HORIZONTAL);
        root.setBackgroundColor(Color.parseColor("#0F172A"));
        int pad = dp(28);
        root.setPadding(pad, dp(72), pad, dp(48));

        TextView label = text("Incoming call", 14, Color.parseColor("#94A3B8"));
        label.setAllCaps(true);
        label.setLetterSpacing(0.08f);
        root.addView(label);

        TextView avatar = text(caller.substring(0, 1).toUpperCase(), 32, Color.WHITE);
        avatar.setGravity(Gravity.CENTER);
        GradientDrawable circle = new GradientDrawable();
        circle.setShape(GradientDrawable.OVAL);
        circle.setColor(Color.parseColor("#2563EB"));
        avatar.setBackground(circle);
        LinearLayout.LayoutParams avatarParams = new LinearLayout.LayoutParams(dp(88), dp(88));
        avatarParams.topMargin = dp(28);
        root.addView(avatar, avatarParams);

        TextView name = text(caller, 28, Color.WHITE);
        name.setTypeface(Typeface.DEFAULT_BOLD);
        name.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams nameParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        nameParams.topMargin = dp(20);
        root.addView(name, nameParams);

        TextView sub = text("HotelBlock team call", 16, Color.parseColor("#94A3B8"));
        sub.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams subParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        subParams.topMargin = dp(8);
        root.addView(sub, subParams);

        LinearLayout actions = new LinearLayout(this);
        actions.setOrientation(LinearLayout.HORIZONTAL);
        actions.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams actionParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        actionParams.topMargin = dp(48);
        root.addView(actions, actionParams);

        Button decline = button("Decline", "#DC2626");
        Button accept = button("Accept", "#16A34A");
        LinearLayout.LayoutParams buttonParams = new LinearLayout.LayoutParams(0, dp(56), 1);
        buttonParams.leftMargin = dp(8);
        buttonParams.rightMargin = dp(8);
        actions.addView(decline, buttonParams);
        actions.addView(accept, buttonParams);
        final String id = callId == null ? "" : callId;
        decline.setOnClickListener(v -> CallWatchService.decline(this, id));
        accept.setOnClickListener(v -> CallWatchService.accept(this, id));
        setContentView(root);
    }

    @Override
    protected void onDestroy() {
        if (current == this) current = null;
        super.onDestroy();
    }

    private TextView text(String value, int sp, int color) {
        TextView view = new TextView(this);
        view.setText(value);
        view.setTextColor(color);
        view.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        return view;
    }

    private Button button(String label, String color) {
        Button button = new Button(this);
        button.setText(label);
        button.setTextColor(Color.WHITE);
        button.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
        button.setAllCaps(false);
        GradientDrawable shape = new GradientDrawable();
        shape.setCornerRadius(dp(28));
        shape.setColor(Color.parseColor(color));
        button.setBackground(shape);
        return button;
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}

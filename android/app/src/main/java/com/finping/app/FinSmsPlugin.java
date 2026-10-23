package com.finping.app;

import android.Manifest;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.database.Cursor;
import android.net.Uri;
import android.provider.Telephony;
import android.telephony.SmsMessage;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.util.LinkedHashMap;
import java.util.Map;

@CapacitorPlugin(
    name = "FinSms",
    permissions = {
        @Permission(alias = "sms", strings = { Manifest.permission.READ_SMS, Manifest.permission.RECEIVE_SMS })
    }
)
public class FinSmsPlugin extends Plugin {

    private BroadcastReceiver receiver;

    private boolean granted() {
        return getPermissionState("sms") == PermissionState.GRANTED;
    }

    @PluginMethod
    public void requestSms(PluginCall call) {
        if (granted()) {
            startListening();
            JSObject r = new JSObject();
            r.put("granted", true);
            call.resolve(r);
            return;
        }
        requestPermissionForAlias("sms", call, "smsPermCallback");
    }

    @PermissionCallback
    private void smsPermCallback(PluginCall call) {
        boolean ok = granted();
        if (ok) startListening();
        JSObject r = new JSObject();
        r.put("granted", ok);
        call.resolve(r);
    }

    @PluginMethod
    public void hasSms(PluginCall call) {
        JSObject r = new JSObject();
        r.put("granted", granted());
        call.resolve(r);
    }

    /** Returns inbox messages newer than sinceMs (epoch millis), oldest first. */
    @PluginMethod
    public void readInbox(PluginCall call) {
        if (!granted()) {
            call.reject("SMS permission not granted");
            return;
        }
        long since = call.getLong("sinceMs", 0L);
        int limit = call.getInt("limit", 500);
        JSArray out = new JSArray();
        Cursor c = null;
        try {
            c = getContext().getContentResolver().query(
                Uri.parse("content://sms/inbox"),
                new String[] { "_id", "address", "body", "date" },
                "date > ?", new String[] { String.valueOf(since) },
                "date DESC LIMIT " + limit);
            if (c != null) {
                while (c.moveToNext()) {
                    JSObject m = new JSObject();
                    m.put("id", c.getLong(0));
                    m.put("address", c.getString(1));
                    m.put("body", c.getString(2));
                    m.put("date", c.getLong(3));
                    out.put(m);
                }
            }
        } catch (Exception e) {
            call.reject("Could not read SMS: " + e.getMessage());
            return;
        } finally {
            if (c != null) c.close();
        }
        JSObject r = new JSObject();
        r.put("messages", out);
        call.resolve(r);
    }

    @PluginMethod
    public void startListening(PluginCall call) {
        if (!granted()) {
            call.reject("SMS permission not granted");
            return;
        }
        startListening();
        call.resolve();
    }

    private void startListening() {
        if (receiver != null) return;
        receiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                if (!Telephony.Sms.Intents.SMS_RECEIVED_ACTION.equals(intent.getAction())) return;
                SmsMessage[] parts = Telephony.Sms.Intents.getMessagesFromIntent(intent);
                if (parts == null) return;
                Map<String, StringBuilder> bySender = new LinkedHashMap<>();
                long date = System.currentTimeMillis();
                for (SmsMessage p : parts) {
                    String addr = p.getOriginatingAddress() == null ? "" : p.getOriginatingAddress();
                    StringBuilder sb = bySender.get(addr);
                    if (sb == null) { sb = new StringBuilder(); bySender.put(addr, sb); }
                    sb.append(p.getMessageBody());
                    date = p.getTimestampMillis();
                }
                for (Map.Entry<String, StringBuilder> e : bySender.entrySet()) {
                    JSObject m = new JSObject();
                    m.put("address", e.getKey());
                    m.put("body", e.getValue().toString());
                    m.put("date", date);
                    notifyListeners("smsReceived", m);
                }
            }
        };
        ContextCompat.registerReceiver(getContext(), receiver,
            new IntentFilter(Telephony.Sms.Intents.SMS_RECEIVED_ACTION),
            ContextCompat.RECEIVER_EXPORTED);
    }

    @Override
    protected void handleOnDestroy() {
        if (receiver != null) {
            try { getContext().unregisterReceiver(receiver); } catch (Exception ignored) {}
            receiver = null;
        }
    }
}

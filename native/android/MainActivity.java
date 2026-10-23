package com.trainy.app;

import android.content.Intent;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(BandHealthPlugin.class);
        registerPlugin(WidgetBridgePlugin.class);
        registerPlugin(MusicBridgePlugin.class);
        super.onCreate(savedInstanceState);
        WidgetStore.INSTANCE.storeAction(this, getIntent());
        getWindow().setSoftInputMode(
            WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE
                | WindowManager.LayoutParams.SOFT_INPUT_STATE_HIDDEN
        );
        getWindow().getDecorView().post(this::applyImeAwareInsets);
    }

    @Override
    public void onResume() {
        super.onResume();
        applyImeAwareInsets();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        WidgetStore.INSTANCE.storeAction(this, intent);
        if (getBridge() == null || getBridge().getWebView() == null) return;
        String action = intent.getStringExtra(WidgetStore.EXTRA_ACTION);
        if (action == null && intent.getData() != null) {
            action = intent.getData().getLastPathSegment();
        }
        if (action == null || action.isEmpty()) return;
        final String safe = action.replace("'", "");
        getBridge().getWebView().post(() ->
            getBridge().getWebView().evaluateJavascript(
                "window.trainyHandleWidgetAction && window.trainyHandleWidgetAction('" + safe + "')",
                null
            )
        );
    }

    private void applyImeAwareInsets() {
        if (getBridge() == null || getBridge().getWebView() == null) return;
        View webView = getBridge().getWebView();
        ViewCompat.setOnApplyWindowInsetsListener(webView, (v, windowInsets) -> {
            Insets bars = windowInsets.getInsets(
                WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout()
            );
            Insets ime = windowInsets.getInsets(WindowInsetsCompat.Type.ime());
            ViewGroup.MarginLayoutParams mlp = (ViewGroup.MarginLayoutParams) v.getLayoutParams();
            mlp.leftMargin = bars.left;
            mlp.topMargin = bars.top;
            mlp.rightMargin = bars.right;
            mlp.bottomMargin = Math.max(bars.bottom, ime.bottom);
            v.setLayoutParams(mlp);

            float density = v.getResources().getDisplayMetrics().density;
            final int cssIme = Math.round(ime.bottom / Math.max(density, 0.01f));
            v.post(() -> notifyKeyboardInset(cssIme));
            return WindowInsetsCompat.CONSUMED;
        });
        ViewCompat.requestApplyInsets(webView);
    }

    private void notifyKeyboardInset(int cssIme) {
        if (getBridge() == null || getBridge().getWebView() == null) return;
        getBridge().getWebView().evaluateJavascript(
            "window.trainySetKeyboardInset && window.trainySetKeyboardInset(" + cssIme + ")",
            null
        );
    }
}

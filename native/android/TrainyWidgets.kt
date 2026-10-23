package com.trainy.app

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.SystemClock
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.widget.RemoteViews
import org.json.JSONArray
import org.json.JSONObject

class StartWidgetProvider : TrainyWidgetProvider() {
    override val layoutId = R.layout.widget_start
}

class SessionWidgetProvider : TrainyWidgetProvider() {
    override val layoutId = R.layout.widget_session
}

class WeekWidgetProvider : TrainyWidgetProvider() {
    override val layoutId = R.layout.widget_week
}

class OverviewWidgetProvider : TrainyWidgetProvider() {
    override val layoutId = R.layout.widget_overview
}

abstract class TrainyWidgetProvider : AppWidgetProvider() {
    abstract val layoutId: Int

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == WIDGET_SELECT_DAY) {
            val iso = intent.getStringExtra("iso").orEmpty()
            if (iso.isNotBlank()) {
                WidgetStore.writeSelected(context, iso)
                refreshAll(context)
            }
            return
        }
        super.onReceive(context, intent)
        when (intent.action) {
            "miui.appwidget.action.APPWIDGET_UPDATE",
            Intent.ACTION_BOOT_COMPLETED,
            Intent.ACTION_LOCKED_BOOT_COMPLETED,
            Intent.ACTION_MY_PACKAGE_REPLACED -> {
                val manager = AppWidgetManager.getInstance(context)
                val ids = manager.getAppWidgetIds(ComponentName(context, javaClass))
                if (ids.isNotEmpty()) onUpdate(context, manager, ids)
            }
        }
    }

    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
        val data = WidgetStore.read(context)
        ids.forEach { id -> updateOne(context, manager, id, layoutId, data) }
    }

    override fun onAppWidgetOptionsChanged(
        context: Context,
        manager: AppWidgetManager,
        id: Int,
        newOptions: Bundle?
    ) {
        super.onAppWidgetOptionsChanged(context, manager, id, newOptions)
        updateOne(context, manager, id, layoutId, WidgetStore.read(context))
    }

    override fun onRestored(context: Context, oldIds: IntArray, newIds: IntArray) {
        super.onRestored(context, oldIds, newIds)
        onUpdate(context, AppWidgetManager.getInstance(context), newIds)
    }

    companion object {
        private val PROVIDERS by lazy {
            listOf(
                StartWidgetProvider::class.java to R.layout.widget_start,
                SessionWidgetProvider::class.java to R.layout.widget_session,
                WeekWidgetProvider::class.java to R.layout.widget_week,
                OverviewWidgetProvider::class.java to R.layout.widget_overview
            )
        }

        // Прямое обновление вместо broadcast: MIUI глушит собственные рассылки приложения.
        fun refreshAll(context: Context) {
            val manager = AppWidgetManager.getInstance(context)
            val data = WidgetStore.read(context)
            PROVIDERS.forEach { (provider, layoutId) ->
                val ids = runCatching {
                    manager.getAppWidgetIds(ComponentName(context, provider))
                }.getOrNull() ?: return@forEach
                ids.forEach { id -> updateOne(context, manager, id, layoutId, data) }
            }
        }

        // Каждый экземпляр виджета может быть своего размера, поэтому собираем его отдельно.
        private fun updateOne(context: Context, manager: AppWidgetManager, id: Int, layoutId: Int, data: JSONObject) {
            val options = runCatching { manager.getAppWidgetOptions(id) }.getOrNull()
            // На телефоне в портретной ориентации реальная высота — MAX_HEIGHT.
            val heightDp = options?.let {
                maxOf(
                    it.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, 0),
                    it.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 0)
                )
            } ?: 0
            runCatching { manager.updateAppWidget(id, safeBind(context, layoutId, data, heightDp)) }
        }
    }
}

// Виджет не должен падать в «Не удаётся загрузить виджет» из-за одного плохого поля.
private fun safeBind(context: Context, layoutId: Int, data: JSONObject, heightDp: Int): RemoteViews =
    runCatching { bind(context, layoutId, data, heightDp) }
        .getOrElse { RemoteViews(context.packageName, layoutId) }

// Сколько места занимает постоянная часть макета без списка — остальное отдаём под строки.
private fun fixedHeightDp(layoutId: Int): Int = when (layoutId) {
    R.layout.widget_start -> 64
    R.layout.widget_session -> 176
    R.layout.widget_week -> 196
    else -> 228
}

// Строка выше голого текста: 12sp, вертикальные отступы и разделитель.
// При 16dp список был длиннее виджета, и кнопки «Начать» / «Результаты» обрезались.
private const val LIST_LINE_DP = 26

// Акцент виджета повторяет цвет, выбранный в приложении (Кабинет → акцент).
private class AccentTheme(
    val color: Int,
    val button: Int,
    val dayDone: Int,
)

private val ACCENTS = mapOf(
    "lime" to AccentTheme(0xFFC8F135.toInt(), R.drawable.widget_btn, R.drawable.widget_day_cell_done),
    "cyan" to AccentTheme(0xFF2FD3F0.toInt(), R.drawable.widget_btn_cyan, R.drawable.widget_day_cell_done_cyan),
    "coral" to AccentTheme(0xFFFF5A5F.toInt(), R.drawable.widget_btn_coral, R.drawable.widget_day_cell_done_coral),
    "violet" to AccentTheme(0xFFA78BFA.toInt(), R.drawable.widget_btn_violet, R.drawable.widget_day_cell_done_violet),
    "amber" to AccentTheme(0xFFFFB454.toInt(), R.drawable.widget_btn_amber, R.drawable.widget_day_cell_done_amber),
)

private fun bind(context: Context, layoutId: Int, data: JSONObject, heightDp: Int): RemoteViews {
    val views = RemoteViews(context.packageName, layoutId)
    val accent = ACCENTS[data.optString("accent", "lime")] ?: ACCENTS.getValue("lime")
    // «Стекло»: полупрозрачная подложка поверх обоев, поэтому вторичный текст светлее.
    val glass = data.optString("widgetStyle", "solid") == "glass"
    val muted = if (glass) 0xFFDCE0E6.toInt() else 0xFF9BA1AB.toInt()
    val nextWhen = data.optString("nextWhen", "План")
    val nextTitle = data.optString("nextTitle", "Тренировка")
    val nextMeta = data.optString("nextMeta", "")
    val sleep = data.optString("sleep", "")
    val startLabel = data.optString("startLabel", "Старт")
    val streak = data.optInt("streak", 0)
    val isActive = data.optBoolean("isActive", false)
    val startedAtMs = data.optLong("startedAtMs", 0L)
    val picked = pickedDay(context, data)
    val viewingLive = isActive && (picked == null || picked.optString("iso") == data.optString("today"))
    val eyebrow = if (viewingLive) {
        data.optString("activeEyebrow", "Идёт тренировка")
    } else {
        picked?.optString("when").orEmpty().ifBlank { nextWhen }
    }
    val title = if (viewingLive) nextTitle else picked?.optString("title").orEmpty().ifBlank { nextTitle }
    val meta = if (viewingLive) nextMeta else picked?.optString("meta").orEmpty().ifBlank { nextMeta }
    val startAction = if (isActive) "open" else "start"
    val button = if (viewingLive || picked == null) "pair" else picked.optString("button", "pair")
    val buttonAction = picked?.optString("buttonAction").orEmpty()
    val primaryAction = when {
        viewingLive || button == "pair" -> startAction
        buttonAction.isNotBlank() -> buttonAction
        button == "result" -> "last"
        else -> "open"
    }
    val primaryLabel = when {
        viewingLive || button == "pair" -> startLabel
        button == "result" -> "Итог"
        else -> "Открыть"
    }
    val quietButton = !viewingLive && button == "open"

    views.setInt(
        R.id.widget_root,
        "setBackgroundResource",
        if (glass) R.drawable.widget_bg_glass else R.drawable.widget_bg
    )
    views.setTextViewText(R.id.widget_eyebrow, eyebrow)
    views.setTextColor(R.id.widget_eyebrow, accent.color)
    views.setTextViewText(R.id.widget_title, title)

    // Во время тренировки время идёт само: Chronometer тикает в процессе лаунчера,
    // поэтому виджет не «замерзает», пока приложение свёрнуто.
    val liveTimer = viewingLive && startedAtMs > 0
    views.setViewVisibility(R.id.widget_title, if (liveTimer) View.GONE else View.VISIBLE)
    views.setViewVisibility(R.id.widget_timer, if (liveTimer) View.VISIBLE else View.GONE)
    if (liveTimer) {
        val elapsed = (System.currentTimeMillis() - startedAtMs).coerceAtLeast(0L)
        views.setChronometer(R.id.widget_timer, SystemClock.elapsedRealtime() - elapsed, null, true)
    } else {
        views.setChronometer(R.id.widget_timer, SystemClock.elapsedRealtime(), null, false)
    }

    views.setOnClickPendingIntent(R.id.widget_root, click(context, layoutId, primaryAction))
    views.setOnClickPendingIntent(R.id.widget_start, click(context, layoutId, primaryAction))
    views.setTextViewText(R.id.widget_start, primaryLabel)
    views.setTextColor(R.id.widget_start, if (quietButton) 0xFFF2F3F5.toInt() else 0xFF10130A.toInt())
    views.setInt(
        R.id.widget_start,
        "setBackgroundResource",
        if (quietButton) {
            if (glass) R.drawable.widget_btn_ghost_glass else R.drawable.widget_btn_ghost
        } else {
            accent.button
        }
    )

    if (layoutId == R.layout.widget_session || layoutId == R.layout.widget_overview) {
        views.setTextViewText(R.id.widget_meta, meta)
        views.setTextColor(R.id.widget_meta, muted)
    }
    val quote = if (viewingLive || picked == null) "" else picked.optString("quote")
    if (layoutId != R.layout.widget_start) {
        // Цитата дня отдыха живёт в свободном месте под списком: мелко и по центру.
        // Сводку прошлой тренировки сюда больше не кладём — она обрезалась и ничего не говорила.
        val weighted = layoutId == R.layout.widget_week || layoutId == R.layout.widget_overview
        if (quote.isNotBlank()) {
            views.setTextViewText(R.id.widget_last, quote)
            views.setTextColor(R.id.widget_last, if (glass) muted else 0xFFB4BAC4.toInt())
            views.setTextViewTextSize(R.id.widget_last, TypedValue.COMPLEX_UNIT_SP, 13f)
            views.setInt(R.id.widget_last, "setMaxLines", 4)
            views.setInt(R.id.widget_last, "setGravity", Gravity.CENTER)
            views.setViewVisibility(R.id.widget_last, View.VISIBLE)
        } else if (weighted) {
            views.setTextViewText(R.id.widget_last, "")
            views.setTextViewTextSize(R.id.widget_last, TypedValue.COMPLEX_UNIT_SP, 11f)
            views.setInt(R.id.widget_last, "setMaxLines", 1)
            views.setInt(R.id.widget_last, "setGravity", Gravity.TOP)
            views.setViewVisibility(R.id.widget_last, View.VISIBLE)
        } else {
            views.setViewVisibility(R.id.widget_last, View.GONE)
        }
    }
    if (layoutId == R.layout.widget_week || layoutId == R.layout.widget_overview) {
        val single = !viewingLive && button != "pair"
        views.setViewVisibility(R.id.widget_last_btn, if (single) View.GONE else View.VISIBLE)
        if (!single) {
            views.setOnClickPendingIntent(R.id.widget_last_btn, click(context, layoutId, "last"))
            views.setInt(
                R.id.widget_last_btn,
                "setBackgroundResource",
                if (glass) R.drawable.widget_btn_ghost_glass else R.drawable.widget_btn_ghost
            )
        }
        if (Build.VERSION.SDK_INT >= 31) {
            val gap = if (single) 0f else 6f
            views.setViewLayoutMargin(R.id.widget_start, RemoteViews.MARGIN_END, gap, TypedValue.COMPLEX_UNIT_DIP)
        }
        bindWeek(views, context, data.optJSONArray("week"), accent, selectedIso(context, data))
    }
    if (layoutId == R.layout.widget_overview) {
        views.setTextViewText(R.id.widget_sleep, sleep)
        views.setTextColor(R.id.widget_sleep, accent.color)
        views.setTextViewText(R.id.widget_streak, if (streak > 0) "$streak нед. подряд" else "Серия пока не началась")
        views.setTextColor(R.id.widget_streak, muted)
        views.setViewVisibility(R.id.widget_sleep, if (sleep.isBlank()) View.GONE else View.VISIBLE)
    }
    val rows = if (viewingLive || picked == null) data.optJSONArray("planRows") else picked.optJSONArray("rows")
    val footer = if (viewingLive || picked == null) data.optJSONArray("footerLines") else picked.optJSONArray("foot")
    bindList(views, layoutId, data, heightDp, muted, rows, footer)
    return views
}

private const val WIDGET_SELECT_DAY = "com.trainy.app.WIDGET_SELECT_DAY"

private fun selectedIso(context: Context, data: JSONObject): String {
    val days = data.optJSONObject("days")
    val today = data.optString("today")
    val saved = WidgetStore.readSelected(context)
    return if (days != null && !saved.isNullOrBlank() && days.has(saved)) saved else today
}

private fun pickedDay(context: Context, data: JSONObject): JSONObject? {
    val days = data.optJSONObject("days") ?: return null
    val iso = selectedIso(context, data)
    val day = days.optJSONObject(iso) ?: return null
    day.put("iso", iso)
    return day
}

private fun bindList(
    views: RemoteViews,
    layoutId: Int,
    data: JSONObject,
    heightDp: Int,
    muted: Int,
    rows: JSONArray?,
    footer: JSONArray?
) {
    val room = if (heightDp > 0) (heightDp - fixedHeightDp(layoutId)) / LIST_LINE_DP else 0
    val list = RemoteViews(views.`package`, R.layout.widget_plan_list)
    val rowCount = rows?.length() ?: 0
    val footerCount = footer?.length() ?: 0
    val accent = ACCENTS[data.optString("accent", "lime")] ?: ACCENTS.getValue("lime")
    val glass = data.optString("widgetStyle", "solid") == "glass"
    val currentBg = if (glass) R.drawable.widget_row_current_glass else R.drawable.widget_row_current
    var shown = 0

    for (index in 0 until rowCount) {
        if (shown >= room) break
        val row = rows!!.optJSONObject(index) ?: continue
        if (shown > 0) list.addView(R.id.widget_plan_list, RemoteViews(views.`package`, R.layout.widget_plan_divider))
        val item = RemoteViews(views.`package`, R.layout.widget_plan_row)
        item.setTextViewText(R.id.widget_plan_name, row.optString("name"))
        item.setTextViewText(R.id.widget_plan_detail, row.optString("detail"))
        item.setTextColor(R.id.widget_plan_detail, muted)
        when (row.optString("state")) {
            "done" -> item.setTextColor(R.id.widget_plan_name, muted)
            "current" -> {
                item.setInt(R.id.widget_plan_row, "setBackgroundResource", currentBg)
                item.setTextColor(R.id.widget_plan_name, accent.color)
                item.setTextColor(R.id.widget_plan_detail, accent.color)
            }
        }
        list.addView(R.id.widget_plan_list, item)
        shown += 1
    }

    for (index in 0 until footerCount) {
        if (shown >= room) break
        if (index == 0 && shown > 0) list.addView(R.id.widget_plan_list, RemoteViews(views.`package`, R.layout.widget_plan_divider))
        val line = RemoteViews(views.`package`, R.layout.widget_plan_footer)
        line.setTextViewText(R.id.widget_plan_footer, footer!!.optString(index))
        line.setTextColor(R.id.widget_plan_footer, muted)
        list.addView(R.id.widget_plan_list, line)
        shown += 1
    }

    views.removeAllViews(R.id.widget_list)
    if (shown > 0) views.addView(R.id.widget_list, list)
}

private fun bindWeek(views: RemoteViews, context: Context, week: JSONArray?, accent: AccentTheme, selected: String) {
    val letters = intArrayOf(
        R.id.widget_day_0, R.id.widget_day_1, R.id.widget_day_2,
        R.id.widget_day_3, R.id.widget_day_4, R.id.widget_day_5, R.id.widget_day_6
    )
    val dates = intArrayOf(
        R.id.widget_date_0, R.id.widget_date_1, R.id.widget_date_2,
        R.id.widget_date_3, R.id.widget_date_4, R.id.widget_date_5, R.id.widget_date_6
    )
    val cells = intArrayOf(
        R.id.widget_cell_0, R.id.widget_cell_1, R.id.widget_cell_2,
        R.id.widget_cell_3, R.id.widget_cell_4, R.id.widget_cell_5, R.id.widget_cell_6
    )
    val fallback = listOf("П", "В", "С", "Ч", "П", "С", "В")
    letters.forEachIndexed { index, id ->
        val day = week?.optJSONObject(index)
        val iso = day?.optString("iso").orEmpty()
        val picked = iso.isNotBlank() && iso == selected
        val done = day?.optBoolean("done") == true || day?.optString("state") == "done"
        val today = day?.optBoolean("today") == true || day?.optString("state") == "today"
        views.setTextViewText(id, day?.optString("label") ?: fallback.getOrElse(index) { "·" })
        views.setTextViewText(dates[index], day?.optString("date") ?: "")
        val background = when {
            picked -> accent.dayDone
            today -> R.drawable.widget_day_cell_today
            else -> R.drawable.widget_day_cell
        }
        views.setInt(cells[index], "setBackgroundResource", background)
        val ink = if (picked) 0xFF10130A.toInt() else 0xFFF2F3F5.toInt()
        val letter = when {
            picked -> ink
            done || today -> accent.color
            else -> 0xFF9BA1AB.toInt()
        }
        views.setTextColor(id, letter)
        views.setTextColor(dates[index], ink)
        if (iso.isNotBlank()) views.setOnClickPendingIntent(cells[index], dayClick(context, iso))
    }
}

private fun dayClick(context: Context, iso: String): PendingIntent {
    val intent = Intent(context, OverviewWidgetProvider::class.java).apply {
        action = WIDGET_SELECT_DAY
        putExtra("iso", iso)
        data = Uri.parse("trainy://widget/day/$iso")
    }
    return PendingIntent.getBroadcast(
        context,
        iso.hashCode(),
        intent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
}

private fun click(context: Context, layoutId: Int, action: String): PendingIntent {
    val intent = Intent(context, MainActivity::class.java).apply {
        this.action = Intent.ACTION_VIEW
        data = Uri.parse("trainy://widget/$action")
        putExtra(WidgetStore.EXTRA_ACTION, action)
        flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
    }
    val requestCode = 1000 + layoutId + action.hashCode()
    return PendingIntent.getActivity(
        context,
        requestCode,
        intent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
}

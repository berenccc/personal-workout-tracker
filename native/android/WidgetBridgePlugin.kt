package com.trainy.app

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.pm.ServiceInfo
import android.appwidget.AppWidgetManager
import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.drawable.Icon
import android.media.MediaMetadata
import android.media.session.MediaSession
import android.media.session.PlaybackState
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.records.HeartRateRecord
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import com.getcapacitor.JSObject
import com.getcapacitor.PermissionState
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback
import java.time.Instant
import org.json.JSONArray
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import org.json.JSONObject

@CapacitorPlugin(
    name = "WidgetBridge",
    permissions = [
        Permission(
            strings = [
                Manifest.permission.BLUETOOTH_SCAN,
                Manifest.permission.BLUETOOTH_CONNECT,
            ],
            alias = "bluetooth",
        ),
    ],
)
class WidgetBridgePlugin : Plugin() {
    @PluginMethod
    fun setWidgetData(call: PluginCall) {
        val json = call.getString("json") ?: "{}"
        WidgetStore.write(context, json)
        TrainyWidgetProvider.refreshAll(context)
        runCatching { WorkoutNotice.sync(context, JSONObject(json)) }
        call.resolve()
    }

    @PluginMethod
    fun consumeAction(call: PluginCall) {
        val action = WidgetStore.consumeAction(context)
        call.resolve(JSObject().put("action", action ?: ""))
    }

    @PluginMethod
    fun pinWidget(call: PluginCall) {
        val host = activity
        if (host == null || Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            call.resolve(JSObject().put("supported", false).put("requested", false))
            return
        }
        val provider = when (call.getString("id")) {
            "start" -> StartWidgetProvider::class.java
            "week" -> WeekWidgetProvider::class.java
            "overview" -> OverviewWidgetProvider::class.java
            else -> SessionWidgetProvider::class.java
        }
        host.runOnUiThread {
            val payload = JSObject()
            try {
                val manager = AppWidgetManager.getInstance(host)
                val supported = manager.isRequestPinAppWidgetSupported
                payload.put("supported", supported)
                payload.put(
                    "requested",
                    if (supported) manager.requestPinAppWidget(ComponentName(host, provider), null, null) else false
                )
                call.resolve(payload)
            } catch (error: Exception) {
                call.reject(error.message)
            }
        }
    }

    @PluginMethod
    fun prepareHeartBroadcast(call: PluginCall) {
        if (Build.VERSION.SDK_INT < 31 || getPermissionState("bluetooth") == PermissionState.GRANTED) {
            BandHeart.ensure(context)
            call.resolve(JSObject().put("ready", true))
            return
        }
        requestPermissionForAlias("bluetooth", call, "onHeartPermission")
    }

    @PermissionCallback
    private fun onHeartPermission(call: PluginCall) {
        val ready = getPermissionState("bluetooth") == PermissionState.GRANTED
        if (ready) BandHeart.ensure(context)
        call.resolve(JSObject().put("ready", ready))
    }

    @PluginMethod
    fun broadcastHeartRate(call: PluginCall) {
        val reading = BandHeart.latest()
        val payload = JSObject()
        if (reading != null) {
            payload.put("bpm", reading.first)
            payload.put("at", reading.second)
        }
        call.resolve(payload)
    }

    @PluginMethod
    fun consumeLockDones(call: PluginCall) {
        val ids = WidgetStore.consumeLockDones(context)
        val array = com.getcapacitor.JSArray()
        ids.forEach { array.put(it) }
        call.resolve(JSObject().put("ids", array))
    }

    @PluginMethod
    fun consumeLockFocus(call: PluginCall) {
        call.resolve(JSObject().put("uid", WidgetStore.consumeLockFocus(context) ?: ""))
    }

    @PluginMethod
    fun broadcastHeartSamples(call: PluginCall) {
        val payload = JSObject()
        payload.put("samples", JSArrayFrom(BandHeart.samplesJson()))
        call.resolve(payload)
    }

    private fun JSArrayFrom(source: JSONArray): com.getcapacitor.JSArray {
        return com.getcapacitor.JSArray(source.toString())
    }
}

// Постоянное уведомление на время тренировки: видно на экране блокировки,
// таймер в нём тикает сам, а пульс раз в 10 секунд перечитывается из Health Connect
// прямо здесь, без WebView: свёрнутое приложение JS-таймеры почти не крутит.
object WorkoutNotice {
    private const val CHANNEL_ID = "workout_lock"
    const val NOTICE_ID = 72
    private const val HR_POLL_MS = 10_000L
    private const val HR_FRESH_MS = 75_000L

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private var pollJob: Job? = null
    private var lastData: JSONObject? = null

    // bpm и время самого замера (не время опроса): Mi Fitness пишет пульс пачками.
    @Volatile private var lastHr: Pair<Int, Long>? = null
    @Volatile private var lastDirectNotifyAt = 0L

    fun sync(context: Context, data: JSONObject) {
        val startedAt = data.optLong("startedAtMs", 0L)
        if (!data.optBoolean("isActive", false) || startedAt <= 0L) {
            stop(context)
            return
        }
        lastData = data
        val app = context.applicationContext
        if (canPost(app)) {
            // Служба держит процесс живым при заблокированном экране и показывает
            // уведомление, которое Nubia не прячет, в отличие от тихого notify.
            ContextCompat.startForegroundService(app, Intent(app, WorkoutLiveService::class.java))
        }
        if (pollJob?.isActive != true) startPolling(app)
    }

    fun stop(context: Context) {
        pollJob?.cancel()
        pollJob = null
        lastData = null
        lastHr = null
        lastDirectNotifyAt = 0L
        BandHeart.stop()
        WorkoutMedia.release()
        WidgetStore.writeLockDones(context, emptySet())
        WidgetStore.consumeLockFocus(context)
        val app = context.applicationContext
        app.stopService(Intent(app, WorkoutLiveService::class.java))
        val manager = app.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.cancel(NOTICE_ID)
    }

    fun isRunning(): Boolean = lastData != null

    fun currentNotification(context: Context): Notification {
        val data = lastData
        return if (data != null) build(context, data) else build(context, JSONObject().put("noticeTitle", "Тренировка"))
    }

    private fun startPolling(context: Context) {
        pollJob = scope.launch {
            while (isActive) {
                BandHeart.ensure(context)
                val reading = BandHeart.latest() ?: runCatching { readLatestHr(context) }.getOrNull()
                val data = lastData ?: break
                if (reading != null && reading != lastHr) {
                    lastHr = reading
                    notify(context, data)
                    refreshWidgetPulse(context, reading.first)
                }
                delay(HR_POLL_MS)
            }
        }
    }

    private suspend fun readLatestHr(context: Context): Pair<Int, Long>? {
        if (HealthConnectClient.getSdkStatus(context) != HealthConnectClient.SDK_AVAILABLE) return null
        val client = HealthConnectClient.getOrCreate(context)
        val end = Instant.now()
        val response = client.readRecords(
            ReadRecordsRequest(
                HeartRateRecord::class,
                timeRangeFilter = TimeRangeFilter.between(end.minusMillis(HR_FRESH_MS), end)
            )
        )
        val sample = response.records
            .flatMap { it.samples }
            .maxByOrNull { it.time }
            ?: return null
        return sample.beatsPerMinute.toInt() to sample.time.toEpochMilli()
    }

    fun onDirectHr(context: Context, bpm: Int, at: Long) {
        if (lastData == null) return
        lastHr = bpm to at
        val now = System.currentTimeMillis()
        if (now - lastDirectNotifyAt < 5_000L) return
        lastDirectNotifyAt = now
        val data = lastData ?: return
        notify(context, data)
        refreshWidgetPulse(context, bpm)
    }

    private fun refreshWidgetPulse(context: Context, bpm: Int) {
        val stored = WidgetStore.read(context)
        if (!stored.optBoolean("isActive", false)) return
        stored.put("activeEyebrow", "Идёт тренировка · ♥ $bpm")
        WidgetStore.write(context, stored.toString())
        TrainyWidgetProvider.refreshAll(context)
    }

    private fun pulseTitle(data: JSONObject): String {
        val fallback = data.optString("noticeTitle", "Идёт тренировка")
        val (bpm, at) = lastHr ?: return fallback
        val age = System.currentTimeMillis() - at
        if (age > HR_FRESH_MS) return fallback
        val progress = data.optString("noticeProgress", "")
        val ago = when {
            age >= 60_000L -> " (${age / 60_000L} мин назад)"
            age >= 20_000L -> " (${age / 1000L} с назад)"
            else -> ""
        }
        return listOf("♥ $bpm уд/мин$ago", progress).filter { it.isNotBlank() }.joinToString(" · ")
    }

    private fun canPost(context: Context): Boolean =
        Build.VERSION.SDK_INT < 33 ||
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED

    private fun notify(context: Context, data: JSONObject) {
        if (!canPost(context)) return
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.notify(NOTICE_ID, build(context, data))
    }

    private fun build(context: Context, data: JSONObject): Notification {
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        // Старый тихий канал Nubia прячет с экрана блокировки, поэтому канал новый и обычный.
        manager.deleteNotificationChannel("workout_live")
        val channel = NotificationChannel(CHANNEL_ID, "Идёт тренировка", NotificationManager.IMPORTANCE_DEFAULT)
        channel.description = "Таймер, пульс и текущее упражнение на экране блокировки"
        channel.lockscreenVisibility = Notification.VISIBILITY_PUBLIC
        channel.setSound(null, null)
        channel.enableVibration(false)
        channel.setShowBadge(false)
        manager.createNotificationChannel(channel)

        val startedAt = data.optLong("startedAtMs", 0L).takeIf { it > 0L } ?: System.currentTimeMillis()
        val pending = WidgetStore.readLockDones(context)
        val current = nextLockSet(context, data, pending)
        val title = current?.optString("name")?.takeIf { it.isNotBlank() } ?: pulseTitle(data)
        val text = listOf(current?.optString("step").orEmpty(), current?.optString("detail").orEmpty())
            .filter { it.isNotBlank() }
            .joinToString(" · ")
            .ifBlank {
                if (data.optJSONArray("liveSets") != null) "Все подходы закрыты" else data.optString("noticeText", "")
            }
        val upcoming = upcomingName(data, current)
        val sub = listOf(pulseTitle(data), upcoming?.let { "Дальше: $it" }.orEmpty())
            .filter { it.isNotBlank() }
            .joinToString(" · ")
        val open = PendingIntent.getActivity(
            context,
            NOTICE_ID,
            Intent(context, MainActivity::class.java).apply {
                action = Intent.ACTION_VIEW
                this.data = Uri.parse("trainy://widget/open")
                putExtra(WidgetStore.EXTRA_ACTION, "open")
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
            },
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        // Карточку как у плеера на экране блокировки система рисует только для
        // уведомления с медиа-сессией. Звука нет, кнопки — подход и упражнения.
        val session = WorkoutMedia.update(context, title, text, sub, open, current != null)
        val built = Notification.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_workout)
            .setContentTitle(title)
            .setContentText(text)
            .setSubText(sub)
            .setWhen(startedAt)
            .setShowWhen(true)
            .setUsesChronometer(true)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setCategory(NotificationCompat.CATEGORY_WORKOUT)
            .setVisibility(Notification.VISIBILITY_PUBLIC)
            .setContentIntent(open)
            .addAction(lockAction(context, R.drawable.ic_lock_prev, "Назад", LockSetReceiver.ACTION_PREV, 2))
            .addAction(lockAction(context, R.drawable.ic_lock_done, "Подход", LockSetReceiver.ACTION, 1))
            .addAction(lockAction(context, R.drawable.ic_lock_next, "Дальше", LockSetReceiver.ACTION_NEXT, 3))
            .setStyle(
                Notification.MediaStyle()
                    .setMediaSession(session.sessionToken)
                    .setShowActionsInCompactView(0, 1, 2)
            )
            .build()
        built.extras.putBoolean("android.requestPromotedOngoing", true)
        return built
    }

    private fun lockAction(context: Context, icon: Int, label: String, action: String, code: Int): Notification.Action {
        val intent = PendingIntent.getBroadcast(
            context,
            NOTICE_ID + code,
            Intent(context, LockSetReceiver::class.java).apply { this.action = action },
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        return Notification.Action.Builder(Icon.createWithResource(context, icon), label, intent).build()
    }

    fun markNextSet(context: Context) {
        val data = WidgetStore.read(context)
        if (!data.optBoolean("isActive", false)) return
        lastData = data
        val pending = WidgetStore.readLockDones(context).toMutableSet()
        val current = nextLockSet(context, data, pending) ?: return
        val id = current.optString("id")
        if (id.isBlank()) return
        pending.add(id)
        WidgetStore.writeLockDones(context, pending)
        notify(context, data)
    }

    fun shiftFocus(context: Context, direction: Int) {
        val data = WidgetStore.read(context)
        if (!data.optBoolean("isActive", false)) return
        lastData = data
        val order = exerciseOrder(data)
        if (order.isEmpty()) return
        val pending = WidgetStore.readLockDones(context)
        val current = nextLockSet(context, data, pending)?.optString("id")?.substringBefore(":")
            ?: focusUid(context, data)
        val index = order.indexOf(current).coerceAtLeast(0)
        val target = order.getOrNull(index + direction) ?: return
        WidgetStore.writeLockFocus(context, target)
        notify(context, data)
    }

    private fun focusUid(context: Context, data: JSONObject): String =
        WidgetStore.readLockFocus(context) ?: data.optString("liveFocusUid", "")

    private fun exerciseOrder(data: JSONObject): List<String> {
        val sets = data.optJSONArray("liveSets") ?: return emptyList()
        val order = mutableListOf<String>()
        for (index in 0 until sets.length()) {
            val uid = sets.optJSONObject(index)?.optString("id")?.substringBefore(":").orEmpty()
            if (uid.isNotBlank() && uid !in order) order.add(uid)
        }
        return order
    }

    private fun upcomingName(data: JSONObject, current: JSONObject?): String? {
        val sets = data.optJSONArray("liveSets") ?: return null
        val currentUid = current?.optString("id")?.substringBefore(":") ?: return null
        var passed = false
        for (index in 0 until sets.length()) {
            val set = sets.optJSONObject(index) ?: continue
            val uid = set.optString("id").substringBefore(":")
            if (uid == currentUid) {
                passed = true
                continue
            }
            if (passed && !set.optBoolean("done")) return set.optString("name").takeIf { it.isNotBlank() }
        }
        return null
    }

    private fun nextLockSet(context: Context, data: JSONObject, pending: Set<String>): JSONObject? {
        val sets = data.optJSONArray("liveSets") ?: return null
        val focus = focusUid(context, data)
        var fallback: JSONObject? = null
        for (index in 0 until sets.length()) {
            val set = sets.optJSONObject(index) ?: continue
            val id = set.optString("id")
            if (id.isBlank() || set.optBoolean("done") || pending.contains(id)) continue
            if (focus.isNotBlank() && id.startsWith("$focus:")) return set
            if (fallback == null) fallback = set
        }
        return fallback
    }
}

// Сессия только ради карточки на экране блокировки: звука нет, фокус аудио не берём.
object WorkoutMedia {
    private const val DONE = "trainy_set_done"
    private var session: MediaSession? = null

    private fun ensure(context: Context): MediaSession {
        session?.let { return it }
        val app = context.applicationContext
        val created = MediaSession(app, "TrainyWorkout")
        created.setCallback(object : MediaSession.Callback() {
            override fun onSkipToNext() = WorkoutNotice.shiftFocus(app, 1)
            override fun onSkipToPrevious() = WorkoutNotice.shiftFocus(app, -1)
            override fun onPlay() = WorkoutNotice.markNextSet(app)
            override fun onPause() = WorkoutNotice.markNextSet(app)
            override fun onCustomAction(action: String, extras: Bundle?) {
                if (action == DONE) WorkoutNotice.markNextSet(app)
            }
        }, Handler(Looper.getMainLooper()))
        created.isActive = true
        session = created
        return created
    }

    fun update(
        context: Context,
        title: String,
        text: String,
        sub: String,
        open: PendingIntent,
        canMark: Boolean
    ): MediaSession {
        val current = ensure(context)
        current.setSessionActivity(open)
        current.setMetadata(
            MediaMetadata.Builder()
                .putString(MediaMetadata.METADATA_KEY_TITLE, title)
                .putString(MediaMetadata.METADATA_KEY_ARTIST, text)
                .putString(MediaMetadata.METADATA_KEY_ALBUM, sub)
                .build()
        )
        val state = PlaybackState.Builder()
            .setActions(PlaybackState.ACTION_SKIP_TO_NEXT or PlaybackState.ACTION_SKIP_TO_PREVIOUS)
            .setState(PlaybackState.STATE_PLAYING, PlaybackState.PLAYBACK_POSITION_UNKNOWN, 0f)
        if (canMark) {
            state.addCustomAction(
                PlaybackState.CustomAction.Builder(DONE, "Подход сделан", R.drawable.ic_lock_done).build()
            )
        }
        current.setPlaybackState(state.build())
        return current
    }

    fun release() {
        session?.isActive = false
        session?.release()
        session = null
    }
}

class LockSetReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        val app = context.applicationContext
        when (intent?.action) {
            ACTION -> WorkoutNotice.markNextSet(app)
            ACTION_NEXT -> WorkoutNotice.shiftFocus(app, 1)
            ACTION_PREV -> WorkoutNotice.shiftFocus(app, -1)
        }
    }

    companion object {
        const val ACTION = "com.trainy.app.LOCK_SET_OK"
        const val ACTION_NEXT = "com.trainy.app.LOCK_NEXT"
        const val ACTION_PREV = "com.trainy.app.LOCK_PREV"
    }
}

// Держит уведомление тренировки, пока экран заблокирован: без службы Nubia его прячет.
class WorkoutLiveService : Service() {
    override fun onBind(intent: Intent?) = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val notice = WorkoutNotice.currentNotification(this)
        if (Build.VERSION.SDK_INT >= 34) {
            var types = ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE
            if (BandHeart.canScan(this)) types = types or ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE
            startForeground(WorkoutNotice.NOTICE_ID, notice, types)
        } else {
            startForeground(WorkoutNotice.NOTICE_ID, notice)
        }
        BandHeart.ensure(this)
        if (!WorkoutNotice.isRunning()) {
            stopForeground(STOP_FOREGROUND_REMOVE)
            stopSelf()
            return START_NOT_STICKY
        }
        return START_STICKY
    }
}

object WidgetStore {
    const val EXTRA_ACTION = "widget_action"
    private const val PREFS = "trainy_widget"
    private const val KEY_JSON = "snapshot"
    private const val KEY_ACTION = "launch_action"
    private const val KEY_SELECTED = "selected_iso"
    private const val KEY_LOCK_DONES = "lock_done_ids"
    private const val KEY_LOCK_FOCUS = "lock_focus_uid"

    fun readLockFocus(context: Context): String? =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_LOCK_FOCUS, null)?.takeIf { it.isNotBlank() }

    fun writeLockFocus(context: Context, uid: String) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY_LOCK_FOCUS, uid).apply()
    }

    fun consumeLockFocus(context: Context): String? {
        val uid = readLockFocus(context)
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().remove(KEY_LOCK_FOCUS).apply()
        return uid
    }

    fun write(context: Context, json: String) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY_JSON, json)
            .apply()
    }

    fun writeSelected(context: Context, iso: String) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY_SELECTED, iso)
            .apply()
    }

    fun readSelected(context: Context): String? =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_SELECTED, null)

    fun read(context: Context): JSONObject {
        val raw = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_JSON, "{}") ?: "{}"
        return runCatching { JSONObject(raw) }.getOrElse { JSONObject() }
    }

    fun storeAction(context: Context, intent: Intent?) {
        val action = intent?.getStringExtra(EXTRA_ACTION)
            ?: intent?.data?.lastPathSegment
            ?: return
        if (action.isBlank()) return
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY_ACTION, action)
            .apply()
    }

    fun readLockDones(context: Context): Set<String> {
        val raw = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_LOCK_DONES, "[]") ?: "[]"
        val parsed = runCatching { org.json.JSONArray(raw) }.getOrElse { org.json.JSONArray() }
        return buildSet {
            for (index in 0 until parsed.length()) {
                val id = parsed.optString(index)
                if (id.isNotBlank()) add(id)
            }
        }
    }

    fun writeLockDones(context: Context, ids: Set<String>) {
        val array = org.json.JSONArray()
        ids.forEach { array.put(it) }
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY_LOCK_DONES, array.toString())
            .apply()
    }

    fun consumeLockDones(context: Context): List<String> {
        val ids = readLockDones(context).toList()
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().remove(KEY_LOCK_DONES).apply()
        return ids
    }

    fun consumeAction(context: Context): String? {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val action = prefs.getString(KEY_ACTION, null)
        prefs.edit().remove(KEY_ACTION).apply()
        return action
    }
}

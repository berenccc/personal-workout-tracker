package com.trainy.app

import android.app.SearchManager
import android.content.ComponentName
import android.content.Intent
import android.os.Bundle
import android.provider.MediaStore
import android.media.AudioManager
import android.media.MediaMetadata
import android.media.session.MediaController
import android.media.session.MediaSessionManager
import android.media.session.PlaybackState
import android.provider.Settings
import android.service.notification.NotificationListenerService
import androidx.core.app.NotificationManagerCompat
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

// Пустая служба: Android отдаёт чужие медиа-сессии только приложению с доступом к уведомлениям.
class TrainyMediaListener : NotificationListenerService()

@CapacitorPlugin(name = "MusicBridge")
class MusicBridgePlugin : Plugin() {
    private val ytMusic = "com.google.android.apps.youtube.music"

    private fun hasAccess(): Boolean =
        NotificationManagerCompat.getEnabledListenerPackages(context).contains(context.packageName)

    private fun controller(): MediaController? {
        if (!hasAccess()) return null
        val manager = context.getSystemService(MediaSessionManager::class.java) ?: return null
        val sessions = runCatching {
            manager.getActiveSessions(ComponentName(context, TrainyMediaListener::class.java))
        }.getOrNull().orEmpty().filter { it.packageName != context.packageName }
        fun playing(item: MediaController) = item.playbackState?.state == PlaybackState.STATE_PLAYING
        return sessions.firstOrNull { it.packageName == ytMusic && playing(it) }
            ?: sessions.firstOrNull { playing(it) }
            ?: sessions.firstOrNull { it.packageName == ytMusic }
            ?: sessions.firstOrNull()
    }

    @PluginMethod
    fun state(call: PluginCall) {
        val payload = JSObject().put("granted", hasAccess())
        val current = controller()
        if (current == null) {
            call.resolve(payload.put("active", false))
            return
        }
        val meta = current.metadata
        val playback = current.playbackState
        payload.put("active", true)
        payload.put("app", current.packageName)
        payload.put("title", meta?.getString(MediaMetadata.METADATA_KEY_TITLE).orEmpty())
        payload.put(
            "artist",
            meta?.getString(MediaMetadata.METADATA_KEY_ARTIST)
                ?: meta?.getString(MediaMetadata.METADATA_KEY_ALBUM_ARTIST).orEmpty()
        )
        payload.put("playing", playback?.state == PlaybackState.STATE_PLAYING)
        val volume = current.playbackInfo
        payload.put("volume", volume?.currentVolume ?: 0)
        payload.put("volumeMax", volume?.maxVolume ?: 0)

        val queue = current.queue.orEmpty()
        val activeId = playback?.activeQueueItemId ?: -1L
        val activeIndex = queue.indexOfFirst { it.queueId == activeId }
        val upcoming = JSArray()
        if (queue.isNotEmpty()) {
            queue.drop(if (activeIndex >= 0) activeIndex + 1 else 0).take(5).forEach { item ->
                upcoming.put(
                    JSObject()
                        .put("id", item.queueId)
                        .put("title", item.description.title?.toString().orEmpty())
                        .put("artist", item.description.subtitle?.toString().orEmpty())
                )
            }
        }
        payload.put("queueKnown", queue.isNotEmpty())
        payload.put("queue", upcoming)
        call.resolve(payload)
    }

    @PluginMethod
    fun control(call: PluginCall) {
        val current = controller()
        val action = call.getString("action")
        val query = call.getString("query").orEmpty().trim()
        if (action == "search" && query.isBlank()) {
            call.reject("Пустой запрос")
            return
        }
        val searchable = ((current?.playbackState?.actions ?: 0L) and PlaybackState.ACTION_PLAY_FROM_SEARCH) != 0L
        if (action == "search" && !searchable) {
            // Плеер не запущен или не принимает поиск через сессию: просим YouTube Music
            // найти и сразу включить, как это делает Ассистент.
            val intent = Intent(MediaStore.INTENT_ACTION_MEDIA_PLAY_FROM_SEARCH)
                .setPackage(ytMusic)
                .putExtra(SearchManager.QUERY, query)
                .putExtra(MediaStore.EXTRA_MEDIA_FOCUS, "vnd.android.cursor.item/*")
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            runCatching { context.startActivity(intent) }
                .onSuccess { call.resolve() }
                .onFailure { call.reject("YouTube Music не установлен") }
            return
        }
        if (current == null) {
            call.reject("Плеер не найден")
            return
        }
        val controls = current.transportControls
        when (action) {
            "next" -> controls.skipToNext()
            "play" -> controls.play()
            "pause" -> controls.pause()
            "search" -> controls.playFromSearch(query, Bundle())
            "prev" -> controls.skipToPrevious()
            "toggle" -> {
                if (current.playbackState?.state == PlaybackState.STATE_PLAYING) controls.pause() else controls.play()
            }
            "queue" -> controls.skipToQueueItem(call.getLong("id") ?: -1L)
            "volumeSet" -> current.setVolumeTo(call.getInt("value") ?: 0, 0)
            // Через сессию плеера: громкость меняется и у телефона, и у Chromecast/колонки.
            // FLAG_SHOW_UI показывает системный ползунок, чтобы было видно уровень.
            "volumeUp" -> current.adjustVolume(AudioManager.ADJUST_RAISE, AudioManager.FLAG_SHOW_UI)
            "volumeDown" -> current.adjustVolume(AudioManager.ADJUST_LOWER, AudioManager.FLAG_SHOW_UI)
            else -> {
                call.reject("Неизвестная команда")
                return
            }
        }
        call.resolve()
    }

    @PluginMethod
    fun openAccess(call: PluginCall) {
        val intent = Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        runCatching { context.startActivity(intent) }
        call.resolve()
    }

    @PluginMethod
    fun openPlayer(call: PluginCall) {
        val launch = context.packageManager.getLaunchIntentForPackage(ytMusic)
        if (launch == null) {
            call.reject("YouTube Music не установлен")
            return
        }
        context.startActivity(launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        call.resolve()
    }
}

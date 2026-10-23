package com.trainy.app

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import androidx.activity.result.ActivityResult
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.HealthConnectFeatures
import androidx.health.connect.client.feature.ExperimentalFeatureAvailabilityApi
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.ActiveCaloriesBurnedRecord
import androidx.health.connect.client.records.DistanceRecord
import androidx.health.connect.client.records.ExerciseSessionRecord
import androidx.health.connect.client.records.HeartRateRecord
import androidx.health.connect.client.records.Record
import androidx.health.connect.client.records.RestingHeartRateRecord
import androidx.health.connect.client.records.SleepSessionRecord
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.records.TotalCaloriesBurnedRecord
import androidx.health.connect.client.records.WeightRecord
import androidx.health.connect.client.request.AggregateRequest
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import androidx.health.connect.client.units.Energy
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import java.time.Duration
import java.time.Instant
import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import kotlin.math.roundToInt
import kotlin.reflect.KClass
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

@CapacitorPlugin(name = "BandHealth")
class BandHealthPlugin : Plugin() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val permissionContract = PermissionController.createRequestPermissionResultContract()
    private val iso = DateTimeFormatter.ISO_INSTANT

    override fun handleOnDestroy() {
        super.handleOnDestroy()
        scope.cancel()
    }

    @PluginMethod
    fun isAvailable(call: PluginCall) {
        val status = HealthConnectClient.getSdkStatus(context)
        val payload = JSObject()
        payload.put("available", status == HealthConnectClient.SDK_AVAILABLE)
        payload.put("platform", "android")
        payload.put(
            "reason",
            when (status) {
                HealthConnectClient.SDK_AVAILABLE -> "ok"
                HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED -> "update"
                else -> "missing"
            }
        )
        call.resolve(payload)
    }

    @PluginMethod
    fun requestAuthorization(call: PluginCall) {
        scope.launch {
            val client = clientOrReject(call) ?: return@launch
            val needed = readPermissions()
            val granted = client.permissionController.getGrantedPermissions()
            if (granted.containsAll(needed)) {
                call.resolve(authStatus(client))
                return@launch
            }
            try {
                startActivityForResult(call, permissionContract.createIntent(context, needed), "onPermission")
            } catch (error: Exception) {
                call.reject("Не удалось открыть разрешения Health Connect", error)
            }
        }
    }

    // Без этого разрешения Health Connect не отдаёт пульс, пока экран заблокирован,
    // и уведомление тренировки застывает на последнем значении.
    @OptIn(ExperimentalFeatureAvailabilityApi::class)
    @PluginMethod
    fun requestBackgroundRead(call: PluginCall) {
        scope.launch {
            val client = clientOrReject(call) ?: return@launch
            val supported = client.features.getFeatureStatus(
                HealthConnectFeatures.FEATURE_READ_HEALTH_DATA_IN_BACKGROUND
            ) == HealthConnectFeatures.FEATURE_STATUS_AVAILABLE
            val permission = HealthPermission.PERMISSION_READ_HEALTH_DATA_IN_BACKGROUND
            if (!supported || client.permissionController.getGrantedPermissions().contains(permission)) {
                call.resolve(backgroundStatus(client, supported))
                return@launch
            }
            try {
                startActivityForResult(call, permissionContract.createIntent(context, setOf(permission)), "onBackgroundPermission")
            } catch (error: Exception) {
                call.resolve(backgroundStatus(client, supported))
            }
        }
    }

    @ActivityCallback
    private fun onBackgroundPermission(call: PluginCall?, result: ActivityResult) {
        if (call == null) return
        scope.launch {
            val client = clientOrReject(call) ?: return@launch
            call.resolve(backgroundStatus(client, true))
        }
    }

    private suspend fun backgroundStatus(client: HealthConnectClient, supported: Boolean): JSObject =
        JSObject().apply {
            put("supported", supported)
            put(
                "granted",
                client.permissionController.getGrantedPermissions()
                    .contains(HealthPermission.PERMISSION_READ_HEALTH_DATA_IN_BACKGROUND)
            )
        }

    @ActivityCallback
    private fun onPermission(call: PluginCall?, result: ActivityResult) {
        if (call == null) return
        scope.launch {
            val client = clientOrReject(call) ?: return@launch
            call.resolve(authStatus(client))
        }
    }

    @PluginMethod
    fun checkAuthorization(call: PluginCall) {
        scope.launch {
            val client = clientOrReject(call) ?: return@launch
            call.resolve(authStatus(client))
        }
    }

    @PluginMethod
    fun openSettings(call: PluginCall) {
        try {
            val settings = Intent(HealthConnectClient.ACTION_HEALTH_CONNECT_SETTINGS)
            settings.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(settings)
            call.resolve()
        } catch (error: Exception) {
            try {
                val store = Intent(
                    Intent.ACTION_VIEW,
                    Uri.parse("market://details?id=com.google.android.apps.healthdata")
                )
                store.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                context.startActivity(store)
                call.resolve()
            } catch (fallback: Exception) {
                call.reject("Не удалось открыть Health Connect", fallback)
            }
        }
    }

    @PluginMethod
    fun readSnapshot(call: PluginCall) {
        scope.launch {
            val client = clientOrReject(call) ?: return@launch
            try {
                val now = Instant.now()
                val zone = ZoneId.systemDefault()
                val todayStart = ZonedDateTime.now(zone).toLocalDate().atStartOfDay(zone).toInstant()
                val tomorrowStart = ZonedDateTime.now(zone).toLocalDate().plusDays(1).atStartOfDay(zone).toInstant()
                val nightStart = ZonedDateTime.now(zone).minusHours(36).toInstant()

                val totals = withContext(Dispatchers.IO) {
                    aggregateTotals(client, todayStart, tomorrowStart)
                }
                val rawToday = withContext(Dispatchers.IO) {
                    rawTotals(client, todayStart, tomorrowStart)
                }
                val sleep = withContext(Dispatchers.IO) {
                    readAll(client, SleepSessionRecord::class, nightStart, now)
                }
                val resting = withContext(Dispatchers.IO) {
                    readAll(client, RestingHeartRateRecord::class, nightStart, now)
                }
                val heart = withContext(Dispatchers.IO) {
                    readAll(client, HeartRateRecord::class, now.minusSeconds(24 * 3600), now)
                }
                val weight = withContext(Dispatchers.IO) {
                    readAll(client, WeightRecord::class, now.minusSeconds(180L * 24 * 3600), now)
                }

                val sleepRecords = preferBand(sleep) { it.metadata.dataOrigin.packageName }
                val restingRecords = preferBand(resting) { it.metadata.dataOrigin.packageName }
                val heartRecords = preferBand(heart) { it.metadata.dataOrigin.packageName }
                val session = sleepRecords.maxByOrNull { Duration.between(it.startTime, it.endTime).toMinutes() }
                val sleepStats = session?.let { summarizeSleep(it) }
                val lastResting = restingRecords.maxByOrNull { it.time }
                val lastHrSample = heartRecords
                    .flatMap { record -> record.samples.map { sample -> sample to record.metadata.dataOrigin.packageName } }
                    .maxByOrNull { it.first.time }
                val lastWeight = weight.maxByOrNull { it.time }

                val payload = JSObject()
                payload.put("available", true)
                payload.put("authorized", true)
                payload.put("updatedAt", iso.format(now))
                payload.put("todaySteps", maxOf(totals.steps ?: 0L, rawToday.steps))
                payload.put("todayCalories", maxOf(totals.activeCalories ?: 0, rawToday.activeCalories))
                payload.put("todayTotalCalories", maxOf(totals.totalCalories ?: 0, rawToday.totalCalories))
                val todayKm = maxOf(totals.distanceKm ?: 0.0, rawToday.distanceKm)
                if (todayKm > 0) payload.put("todayDistanceKm", (todayKm * 100).roundToInt() / 100.0)
                if (sleepStats != null) {
                    payload.put("sleepMinutes", sleepStats.asleep)
                    payload.put("sleepDeepMinutes", sleepStats.deep)
                    payload.put("sleepLightMinutes", sleepStats.light)
                    payload.put("sleepRemMinutes", sleepStats.rem)
                    payload.put("sleepStart", iso.format(session.startTime))
                    payload.put("sleepEnd", iso.format(session.endTime))
                }
                lastResting?.let { payload.put("restingHr", it.beatsPerMinute.toInt()) }
                lastHrSample?.let {
                    payload.put("lastHr", it.first.beatsPerMinute.toInt())
                    payload.put("lastHrAt", iso.format(it.first.time))
                }
                val daySamples = heartRecords
                    .flatMap { record -> record.samples.map { sample -> sample.time to sample.beatsPerMinute.toInt() } }
                    .sortedBy { it.first }
                payload.put("hrCount24h", daySamples.size)
                if (daySamples.isNotEmpty()) {
                    val values = daySamples.map { it.second }
                    payload.put("hrDayMin", values.min())
                    payload.put("hrDayMax", values.max())
                    payload.put("hrDayAvg", values.average().roundToInt())
                    payload.put(
                        "hrDaySeries",
                        JSArray().apply {
                            downsample(daySamples, 96).forEach { (time, bpm) ->
                                put(JSObject().apply {
                                    put("t", iso.format(time))
                                    put("bpm", bpm)
                                })
                            }
                        }
                    )
                }
                payload.put(
                    "permissions",
                    permissionFlags(client.permissionController.getGrantedPermissions())
                )
                lastWeight?.let { payload.put("weightKg", it.weight.inKilograms.roundToInt()) }
                val sources = JSArray()
                (totals.origins +
                    sleepRecords.map { it.metadata.dataOrigin.packageName } +
                    heartRecords.map { it.metadata.dataOrigin.packageName })
                    .distinct()
                    .forEach { sources.put(it) }
                payload.put("sources", sources)
                call.resolve(payload)
            } catch (error: Exception) {
                call.reject("Не удалось прочитать данные браслета", error)
            }
        }
    }

    @PluginMethod
    fun readHeartRate(call: PluginCall) {
        val start = parseInstant(call.getString("startDate"))
        val end = parseInstant(call.getString("endDate")) ?: Instant.now()
        if (start == null) {
            call.reject("Нужна startDate")
            return
        }
        scope.launch {
            val client = clientOrReject(call) ?: return@launch
            try {
                call.resolve(readHeartPayload(client, start, end))
            } catch (error: Exception) {
                call.reject("Не удалось прочитать пульс", error)
            }
        }
    }

    @PluginMethod
    fun readSession(call: PluginCall) {
        val start = parseInstant(call.getString("startDate"))
        val end = parseInstant(call.getString("endDate")) ?: Instant.now()
        if (start == null) {
            call.reject("Нужна startDate")
            return
        }
        scope.launch {
            val client = clientOrReject(call) ?: return@launch
            try {
                val paddedStart = start.minusSeconds(120)
                val paddedEnd = end.plusSeconds(180)

                // Если браслет записал свою тренировку, берём её границы: таймер в приложении
                // и запись браслета почти никогда не совпадают минута в минуту.
                val exercises = withContext(Dispatchers.IO) {
                    preferBand(
                        readAll(client, ExerciseSessionRecord::class, paddedStart, paddedEnd)
                    ) { it.metadata.dataOrigin.packageName }
                }
                val longest = exercises.maxByOrNull { Duration.between(it.startTime, it.endTime).seconds }
                val windowStart = minOf(paddedStart, longest?.startTime ?: paddedStart)
                val windowEnd = maxOf(paddedEnd, longest?.endTime ?: paddedEnd)

                // Плотный ряд нужен, чтобы разложить пульс по упражнениям и паузам.
                val heart = readHeartPayload(client, windowStart, windowEnd, maxPoints = 600)
                val totals = withContext(Dispatchers.IO) {
                    aggregateTotals(client, windowStart, windowEnd)
                }
                val raw = withContext(Dispatchers.IO) {
                    rawTotals(client, windowStart, windowEnd)
                }
                val payload = JSObject()
                heart.keys().forEach { key -> payload.put(key, heart.get(key)) }
                payload.put("windowStart", iso.format(windowStart))
                payload.put("windowEnd", iso.format(windowEnd))
                payload.put("steps", maxOf(totals.steps ?: 0L, raw.steps))
                payload.put("calories", maxOf(totals.activeCalories ?: 0, raw.activeCalories))
                payload.put("totalCalories", maxOf(totals.totalCalories ?: 0, raw.totalCalories))
                payload.put("aggregateCalories", totals.activeCalories ?: 0)
                payload.put("rawActiveCalories", raw.activeCalories)
                payload.put("rawTotalCalories", raw.totalCalories)
                payload.put(
                    "caloriesBySource",
                    JSArray().apply {
                        raw.caloriesBySource.forEach { (source, kcal) ->
                            put(JSObject().apply {
                                put("source", source)
                                put("kcal", kcal.roundToInt())
                            })
                        }
                    }
                )
                val km = maxOf(totals.distanceKm ?: 0.0, raw.distanceKm)
                if (km > 0) payload.put("distanceKm", (km * 100).roundToInt() / 100.0)
                val sessions = JSArray()
                exercises.forEach { record ->
                    sessions.put(
                        JSObject().apply {
                            put("title", record.title ?: "")
                            put("type", exerciseLabel(record.exerciseType))
                            put("typeId", record.exerciseType)
                            put("start", iso.format(record.startTime))
                            put("end", iso.format(record.endTime))
                        }
                    )
                }
                payload.put("exercises", sessions)
                payload.put(
                    "sources",
                    JSArray().apply { totals.origins.distinct().forEach { put(it) } }
                )
                call.resolve(payload)
            } catch (error: Exception) {
                call.reject("Не удалось прочитать сессию браслета", error)
            }
        }
    }

    // Прозрачность вместо «непонятных цифр»: что именно Health Connect отдал и от кого.
    @PluginMethod
    fun readDiagnostics(call: PluginCall) {
        val end = parseInstant(call.getString("endDate")) ?: Instant.now()
        val start = parseInstant(call.getString("startDate")) ?: end.minusSeconds(24 * 3600)
        scope.launch {
            val client = clientOrReject(call) ?: return@launch
            try {
                val granted = client.permissionController.getGrantedPermissions()
                val rows = JSArray()
                rows.put(
                    diagnosticRow(client, granted, "Пульс", HeartRateRecord::class, start, end) { record ->
                        record.samples.size.toDouble()
                    }
                )
                rows.put(
                    diagnosticRow(client, granted, "Активные ккал", ActiveCaloriesBurnedRecord::class, start, end) { record ->
                        record.energy.inKilocalories
                    }
                )
                rows.put(
                    diagnosticRow(client, granted, "Всего ккал", TotalCaloriesBurnedRecord::class, start, end) { record ->
                        record.energy.inKilocalories
                    }
                )
                rows.put(
                    diagnosticRow(client, granted, "Шаги", StepsRecord::class, start, end) { record ->
                        record.count.toDouble()
                    }
                )
                rows.put(
                    diagnosticRow(client, granted, "Сон", SleepSessionRecord::class, start, end) { _ -> 1.0 }
                )
                rows.put(
                    diagnosticRow(client, granted, "Тренировки", ExerciseSessionRecord::class, start, end) { _ -> 1.0 }
                )
                val payload = JSObject()
                payload.put("from", iso.format(start))
                payload.put("to", iso.format(end))
                payload.put("rows", rows)
                payload.put("permissions", permissionFlags(granted))
                call.resolve(payload)
            } catch (error: Exception) {
                call.reject("Не удалось прочитать диагностику", error)
            }
        }
    }

    private suspend fun <T : Record> diagnosticRow(
        client: HealthConnectClient,
        granted: Set<String>,
        label: String,
        type: KClass<T>,
        start: Instant,
        end: Instant,
        value: (T) -> Double
    ): JSObject {
        // readAll глотает SecurityException, поэтому «нет доступа» и «нет записей»
        // иначе выглядели бы одинаково — нулями.
        val allowed = granted.contains(HealthPermission.getReadPermission(type))
        val records = if (allowed) withContext(Dispatchers.IO) { readAll(client, type, start, end) } else emptyList()
        val sum = records.sumOf(value)
        // Разбивка по источникам показывает, чьи цифры приложение вообще видит.
        val bySource = records.groupBy { originOf(it) }
            .map { (source, items) -> source to items.sumOf(value) }
            .sortedByDescending { it.second }
        return JSObject().apply {
            put("label", label)
            put("granted", allowed)
            put("records", records.size)
            put("sum", (sum * 10).roundToInt() / 10.0)
            put(
                "sources",
                JSArray().apply {
                    bySource.forEach { (source, value) ->
                        put("$source: ${(value * 10).roundToInt() / 10.0}")
                    }
                }
            )
        }
    }

    private fun originOf(record: Record): String = runCatching {
        record.metadata.dataOrigin.packageName
    }.getOrElse { "unknown" }

    @PluginMethod
    fun startBandWorkout(call: PluginCall) {
        requestPostNotifications()
        pingVendorWorkout("start")
        postBandNotice(
            "Свободная тренировка",
            "Запусти её на браслете — так пойдёт непрерывный пульс"
        )
        val payload = JSObject()
        payload.put("autoStart", false)
        payload.put("nudged", true)
        call.resolve(payload)
    }

    @PluginMethod
    fun stopBandWorkout(call: PluginCall) {
        pingVendorWorkout("stop")
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.cancel(BAND_NOTICE_ID)
        call.resolve()
    }

    private suspend fun clientOrReject(call: PluginCall): HealthConnectClient? {
        val status = HealthConnectClient.getSdkStatus(context)
        if (status != HealthConnectClient.SDK_AVAILABLE) {
            val payload = JSObject()
            payload.put("available", false)
            payload.put("reason", if (status == HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED) "update" else "missing")
            call.resolve(payload)
            return null
        }
        return HealthConnectClient.getOrCreate(context)
    }

    private suspend fun authStatus(client: HealthConnectClient): JSObject {
        val granted = client.permissionController.getGrantedPermissions()
        val needed = readPermissions()
        val authorized = JSArray()
        val denied = JSArray()
        permissionMap().forEach { (name, permission) ->
            if (granted.contains(permission)) authorized.put(name) else denied.put(name)
        }
        return JSObject().apply {
            put("available", true)
            put("authorized", granted.containsAll(needed))
            put("readAuthorized", authorized)
            put("readDenied", denied)
        }
    }

    private fun permissionMap(): Map<String, String> = mapOf(
        "heartRate" to HealthPermission.getReadPermission(HeartRateRecord::class),
        "steps" to HealthPermission.getReadPermission(StepsRecord::class),
        "sleep" to HealthPermission.getReadPermission(SleepSessionRecord::class),
        "restingHeartRate" to HealthPermission.getReadPermission(RestingHeartRateRecord::class),
        "activeCalories" to HealthPermission.getReadPermission(ActiveCaloriesBurnedRecord::class),
        "totalCalories" to HealthPermission.getReadPermission(TotalCaloriesBurnedRecord::class),
        "exercise" to HealthPermission.getReadPermission(ExerciseSessionRecord::class),
        "distance" to HealthPermission.getReadPermission(DistanceRecord::class),
        "weight" to HealthPermission.getReadPermission(WeightRecord::class)
    )

    private fun readPermissions(): Set<String> = permissionMap().values.toSet()

    private fun permissionFlags(granted: Set<String>): JSObject = JSObject().apply {
        permissionMap().forEach { (name, permission) -> put(name, granted.contains(permission)) }
    }

    private suspend fun readHeartPayload(
        client: HealthConnectClient,
        start: Instant,
        end: Instant,
        maxPoints: Int = 90
    ): JSObject {
        val records = withContext(Dispatchers.IO) {
            readAll(client, HeartRateRecord::class, start, end)
        }
        val preferred = preferBand(records) { it.metadata.dataOrigin.packageName }
        val raw = preferred.flatMap { record ->
            record.samples.map { sample -> sample.time to sample.beatsPerMinute.toInt() }
        }.sortedBy { it.first }
        val samples = downsample(raw, maxPoints)
        val values = samples.map { it.second }
        val payload = JSObject()
        payload.put(
            "samples",
            JSArray().apply {
                samples.forEach { (time, bpm) ->
                    put(
                        JSObject().apply {
                            put("bpm", bpm)
                            put("time", iso.format(time))
                        }
                    )
                }
            }
        )
        if (raw.isNotEmpty()) {
            val latest = raw.last()
            payload.put("latestBpm", latest.second)
            payload.put("latestAt", iso.format(latest.first))
        }
        if (values.isNotEmpty()) {
            payload.put("hrMin", values.min())
            payload.put("hrMax", values.max())
            payload.put("hrAvg", values.average().roundToInt())
            payload.put("count", values.size)
            payload.put("rawCount", raw.size)
        }
        payload.put(
            "hrSources",
            JSArray().apply {
                preferred.map { it.metadata.dataOrigin.packageName }.distinct().forEach { put(it) }
            }
        )
        return payload
    }

    // Health Connect при aggregate() схлопывает пересекающиеся записи по приоритету
    // приложений, и калории браслета могут пропасть в пользу счётчика телефона.
    // Поэтому суммируем сырые записи сами, отдавая предпочтение источнику-браслету.
    private suspend fun rawTotals(
        client: HealthConnectClient,
        start: Instant,
        end: Instant
    ): RawTotals {
        val active = readAll(client, ActiveCaloriesBurnedRecord::class, start, end)
        val total = readAll(client, TotalCaloriesBurnedRecord::class, start, end)
        val steps = readAll(client, StepsRecord::class, start, end)
        val distance = readAll(client, DistanceRecord::class, start, end)

        val bySource = mutableMapOf<String, Double>()
        (active.map { originOf(it) to it.energy.inKilocalories } +
            total.map { originOf(it) to it.energy.inKilocalories })
            .forEach { (source, kcal) -> bySource[source] = (bySource[source] ?: 0.0) + kcal }

        return RawTotals(
            activeCalories = preferBand(active) { originOf(it) }
                .sumOf { it.energy.inKilocalories }.roundToInt(),
            totalCalories = preferBand(total) { originOf(it) }
                .sumOf { it.energy.inKilocalories }.roundToInt(),
            steps = preferBand(steps) { originOf(it) }.sumOf { it.count },
            distanceKm = preferBand(distance) { originOf(it) }
                .sumOf { it.distance.inKilometers },
            caloriesBySource = bySource
        )
    }

    private data class RawTotals(
        val activeCalories: Int = 0,
        val totalCalories: Int = 0,
        val steps: Long = 0,
        val distanceKm: Double = 0.0,
        val caloriesBySource: Map<String, Double> = emptyMap()
    )

    private suspend fun aggregateTotals(
        client: HealthConnectClient,
        start: Instant,
        end: Instant
    ): BandTotals {
        val metrics = setOf(
            StepsRecord.COUNT_TOTAL,
            ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL,
            TotalCaloriesBurnedRecord.ENERGY_TOTAL,
            DistanceRecord.DISTANCE_TOTAL
        )
        val result = runCatching {
            client.aggregate(
                AggregateRequest(
                    metrics = metrics,
                    timeRangeFilter = TimeRangeFilter.between(start, end)
                )
            )
        }.getOrNull() ?: return BandTotals()
        val steps = result[StepsRecord.COUNT_TOTAL]
        val active = result[ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL]?.kcal()
        val total = result[TotalCaloriesBurnedRecord.ENERGY_TOTAL]?.kcal()
        val km = result[DistanceRecord.DISTANCE_TOTAL]?.inKilometers
        return BandTotals(
            steps = steps,
            activeCalories = active,
            totalCalories = total,
            distanceKm = km?.takeIf { it > 0 }?.let { (it * 100).roundToInt() / 100.0 },
            origins = result.dataOrigins.map { it.packageName }
        )
    }

    private suspend fun <T : Record> readAll(
        client: HealthConnectClient,
        type: KClass<T>,
        start: Instant,
        end: Instant
    ): List<T> {
        val out = mutableListOf<T>()
        var pageToken: String? = null
        do {
            val response = runCatching {
                client.readRecords(
                    ReadRecordsRequest(
                        recordType = type,
                        timeRangeFilter = TimeRangeFilter.between(start, end),
                        pageSize = 200,
                        pageToken = pageToken
                    )
                )
            }.getOrNull() ?: break
            out += response.records
            pageToken = response.pageToken
        } while (pageToken != null && out.size < 2000)
        return out
    }

    private fun <T> preferBand(records: List<T>, origin: (T) -> String): List<T> {
        val band = records.filter { isBandSource(origin(it)) }
        return band.ifEmpty { records }
    }

    private fun isBandSource(packageName: String): Boolean {
        val value = packageName.lowercase()
        return listOf("xiaomi", "huami", "zepp", "mifit", "mi.health", "mi.fitness", "amazfit").any { value.contains(it) }
    }

    private fun downsample(samples: List<Pair<Instant, Int>>, maxPoints: Int = 90): List<Pair<Instant, Int>> {
        if (samples.size <= maxPoints) return samples
        val step = samples.size.toDouble() / maxPoints
        return (0 until maxPoints).map { index ->
            samples[(index * step).toInt().coerceAtMost(samples.lastIndex)]
        }
    }

    private fun exerciseLabel(type: Int): String = when (type) {
        ExerciseSessionRecord.EXERCISE_TYPE_STRENGTH_TRAINING -> "Силовая"
        ExerciseSessionRecord.EXERCISE_TYPE_WALKING -> "Ходьба"
        ExerciseSessionRecord.EXERCISE_TYPE_RUNNING -> "Бег"
        ExerciseSessionRecord.EXERCISE_TYPE_BIKING -> "Вело"
        ExerciseSessionRecord.EXERCISE_TYPE_YOGA -> "Йога"
        else -> "Свободная"
    }

    private fun summarizeSleep(session: SleepSessionRecord): SleepStats {
        val stages = session.stages
        if (stages.isEmpty()) {
            val total = Duration.between(session.startTime, session.endTime).toMinutes().toInt().coerceAtLeast(0)
            return SleepStats(asleep = total, deep = 0, light = total, rem = 0)
        }
        var asleep = 0
        var deep = 0
        var light = 0
        var rem = 0
        stages.forEach { stage ->
            val minutes = Duration.between(stage.startTime, stage.endTime).toMinutes().toInt().coerceAtLeast(0)
            when (stage.stage) {
                SleepSessionRecord.STAGE_TYPE_DEEP -> {
                    deep += minutes
                    asleep += minutes
                }
                SleepSessionRecord.STAGE_TYPE_REM -> {
                    rem += minutes
                    asleep += minutes
                }
                SleepSessionRecord.STAGE_TYPE_LIGHT, SleepSessionRecord.STAGE_TYPE_SLEEPING -> {
                    light += minutes
                    asleep += minutes
                }
            }
        }
        if (asleep == 0) {
            asleep = Duration.between(session.startTime, session.endTime).toMinutes().toInt().coerceAtLeast(0)
        }
        return SleepStats(asleep, deep, light, rem)
    }

    private fun parseInstant(value: String?): Instant? {
        if (value.isNullOrBlank()) return null
        return runCatching { Instant.parse(value) }.getOrNull()
    }

    private fun Energy.kcal(): Int? {
        val value = inKilocalories.roundToInt()
        return if (value > 0) value else null
    }

    private data class SleepStats(
        val asleep: Int,
        val deep: Int,
        val light: Int,
        val rem: Int
    )

    private data class BandTotals(
        val steps: Long? = null,
        val activeCalories: Int? = null,
        val totalCalories: Int? = null,
        val distanceKm: Double? = null,
        val origins: List<String> = emptyList()
    )

    private fun requestPostNotifications() {
        if (Build.VERSION.SDK_INT < 33) return
        val host = activity ?: return
        if (ContextCompat.checkSelfPermission(host, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) return
        host.requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 2101)
    }

    private fun ensureChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val channel = NotificationChannel(
            BAND_CHANNEL_ID,
            "Тренировка на браслете",
            NotificationManager.IMPORTANCE_HIGH
        )
        channel.description = "Сигнал на Mi Band: запусти свободную тренировку"
        channel.enableVibration(true)
        manager.createNotificationChannel(channel)
    }

    private fun postBandNotice(title: String, text: String) {
        ensureChannel()
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            return
        }
        val notice = NotificationCompat.Builder(context, BAND_CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_workout)
            .setContentTitle(title)
            .setContentText(text)
            .setStyle(NotificationCompat.BigTextStyle().bigText(text))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_WORKOUT)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setAutoCancel(true)
            .build()
        NotificationManagerCompat.from(context).notify(BAND_NOTICE_ID, notice)
    }

    private fun pingVendorWorkout(phase: String) {
        val packages = listOf("com.xiaomi.wearable", "com.xiaomi.hm.health", "com.huami.midong")
        val actions = if (phase == "stop") {
            listOf(
                "com.xiaomi.wearable.action.STOP_WORKOUT",
                "com.xiaomi.hm.health.action.STOP_SPORT"
            )
        } else {
            listOf(
                "com.xiaomi.wearable.action.START_WORKOUT",
                "com.xiaomi.hm.health.action.START_SPORT",
                "com.xiaomi.wearable.START_SPORT"
            )
        }
        packages.forEach { packageName ->
            actions.forEach { action ->
                runCatching {
                    context.sendBroadcast(
                        Intent(action)
                            .setPackage(packageName)
                            .putExtra("sport", "free")
                            .putExtra("type", "free")
                    )
                }
            }
        }
    }

    companion object {
        private const val BAND_CHANNEL_ID = "band_workout"
        private const val BAND_NOTICE_ID = 71
    }
}

package com.trainy.app

import android.Manifest
import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCallback
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothGattDescriptor
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothProfile
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanFilter
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.ParcelUuid
import androidx.core.content.ContextCompat
import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant
import java.util.UUID

// Прямой пульс с браслета: стандартный BLE Heart Rate (0x180D),
// который Mi Band отдаёт, когда в Mi Fitness включена трансляция пульса.
object BandHeart {
    private val HR_SERVICE: UUID = UUID.fromString("0000180d-0000-1000-8000-00805f9b34fb")
    private val HR_MEASUREMENT: UUID = UUID.fromString("00002a37-0000-1000-8000-00805f9b34fb")
    private val CCCD: UUID = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb")
    private const val FRESH_MS = 15_000L

    private val main = Handler(Looper.getMainLooper())
    private val samples = mutableListOf<JSONObject>()

    @Volatile private var appContext: Context? = null
    @Volatile private var bpm: Int = 0
    @Volatile private var at: Long = 0L
    @Volatile private var scanning = false
    @Volatile private var connected = false

    private var gatt: BluetoothGatt? = null

    fun canScan(context: Context): Boolean {
        if (Build.VERSION.SDK_INT < 31) return true
        val scan = ContextCompat.checkSelfPermission(context, Manifest.permission.BLUETOOTH_SCAN)
        val connect = ContextCompat.checkSelfPermission(context, Manifest.permission.BLUETOOTH_CONNECT)
        return scan == PackageManager.PERMISSION_GRANTED && connect == PackageManager.PERMISSION_GRANTED
    }

    fun latest(): Pair<Int, Long>? {
        val stamp = at
        val value = bpm
        if (value <= 0 || System.currentTimeMillis() - stamp > FRESH_MS) return null
        return value to stamp
    }

    fun samplesJson(): JSONArray {
        val copy = synchronized(samples) { JSONArray(samples.map { JSONObject(it.toString()) }) }
        return copy
    }

    fun ensure(context: Context) {
        if (!canScan(context)) return
        appContext = context.applicationContext
        if (connected || scanning) return
        main.post { startScan() }
    }

    fun stop() {
        main.post {
            stopScan()
            closeGatt()
            connected = false
            bpm = 0
            at = 0L
            synchronized(samples) { samples.clear() }
        }
    }

    @SuppressLint("MissingPermission")
    private fun startScan() {
        val context = appContext ?: return
        if (!canScan(context) || connected || scanning) return
        val adapter = bluetoothAdapter(context) ?: return
        if (!adapter.isEnabled) return
        val scanner = adapter.bluetoothLeScanner ?: return
        val filter = ScanFilter.Builder().setServiceUuid(ParcelUuid(HR_SERVICE)).build()
        val settings = ScanSettings.Builder().setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY).build()
        scanning = true
        runCatching { scanner.startScan(listOf(filter), settings, scanCallback) }
            .onFailure { scanning = false }
        main.postDelayed({
            if (!connected) stopScan()
        }, 12_000L)
    }

    @SuppressLint("MissingPermission")
    private fun stopScan() {
        scanning = false
        val context = appContext ?: return
        val scanner = bluetoothAdapter(context)?.bluetoothLeScanner ?: return
        runCatching { scanner.stopScan(scanCallback) }
    }

    private val scanCallback = object : ScanCallback() {
        override fun onScanResult(callbackType: Int, result: ScanResult) {
            val device = result.device ?: return
            if (!looksLikeBand(device)) return
            main.post { connect(device) }
        }
    }

    @SuppressLint("MissingPermission")
    private fun looksLikeBand(device: BluetoothDevice): Boolean {
        val name = (device.name ?: "").lowercase()
        if (name.isBlank()) return false
        return listOf("xiaomi", "mi band", "miband", "smart band", "mi smart").any { name.contains(it) }
    }

    @SuppressLint("MissingPermission")
    private fun connect(device: BluetoothDevice) {
        if (connected || gatt != null) return
        val context = appContext ?: return
        stopScan()
        gatt = if (Build.VERSION.SDK_INT >= 23) {
            device.connectGatt(context, false, gattCallback, BluetoothDevice.TRANSPORT_LE)
        } else {
            device.connectGatt(context, false, gattCallback)
        }
    }

    private val gattCallback = object : BluetoothGattCallback() {
        @SuppressLint("MissingPermission")
        override fun onConnectionStateChange(gatt: BluetoothGatt, status: Int, newState: Int) {
            if (newState == BluetoothProfile.STATE_CONNECTED && status == BluetoothGatt.GATT_SUCCESS) {
                connected = true
                gatt.discoverServices()
                return
            }
            connected = false
            closeGatt()
            main.postDelayed({ appContext?.let { ensure(it) } }, 2_000L)
        }

        @SuppressLint("MissingPermission")
        override fun onServicesDiscovered(gatt: BluetoothGatt, status: Int) {
            val characteristic = gatt.getService(HR_SERVICE)?.getCharacteristic(HR_MEASUREMENT) ?: return
            gatt.setCharacteristicNotification(characteristic, true)
            val descriptor = characteristic.getDescriptor(CCCD) ?: return
            if (Build.VERSION.SDK_INT >= 33) {
                gatt.writeDescriptor(descriptor, BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE)
            } else {
                @Suppress("DEPRECATION")
                descriptor.value = BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE
                @Suppress("DEPRECATION")
                gatt.writeDescriptor(descriptor)
            }
        }

        override fun onCharacteristicChanged(
            gatt: BluetoothGatt,
            characteristic: BluetoothGattCharacteristic,
            value: ByteArray
        ) {
            accept(value)
        }

        @Deprecated("Deprecated in API 33")
        override fun onCharacteristicChanged(gatt: BluetoothGatt, characteristic: BluetoothGattCharacteristic) {
            @Suppress("DEPRECATION")
            accept(characteristic.value ?: return)
        }
    }

    private fun accept(value: ByteArray) {
        val reading = parseBpm(value) ?: return
        val now = System.currentTimeMillis()
        bpm = reading
        at = now
        synchronized(samples) {
            if (samples.size > 4000) samples.removeAt(0)
            samples.add(JSONObject().put("bpm", reading).put("time", Instant.ofEpochMilli(now).toString()))
        }
        val context = appContext ?: return
        WorkoutNotice.onDirectHr(context, reading, now)
    }

    fun parseBpm(value: ByteArray): Int? {
        if (value.isEmpty()) return null
        val flags = value[0].toInt()
        val heart = if (flags and 0x01 == 0) {
            if (value.size < 2) return null
            value[1].toInt() and 0xff
        } else {
            if (value.size < 3) return null
            (value[1].toInt() and 0xff) or ((value[2].toInt() and 0xff) shl 8)
        }
        return heart.takeIf { it in 30..230 }
    }

    @SuppressLint("MissingPermission")
    private fun closeGatt() {
        runCatching { gatt?.close() }
        gatt = null
    }

    private fun bluetoothAdapter(context: Context): BluetoothAdapter? {
        val manager = context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
        return manager?.adapter
    }
}

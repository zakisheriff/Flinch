package com.flinch.modules

import android.bluetooth.BluetoothManager
import android.bluetooth.le.AdvertiseCallback
import android.bluetooth.le.AdvertiseData
import android.bluetooth.le.AdvertiseSettings
import android.content.Context
import android.os.ParcelUuid
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.File
import java.io.FileInputStream
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress
import java.net.Socket
import java.util.UUID
import java.util.concurrent.Executors

class FlinchNetworkModule(reactContext: ReactApplicationContext) :
        ReactContextBaseJavaModule(reactContext) {
    private val executor = Executors.newCachedThreadPool()
    private var tcpSocket: Socket? = null
    private var udpSocket: DatagramSocket? = null
    private var advertiser: android.bluetooth.le.BluetoothLeAdvertiser? = null
    private var advertiseCallback: AdvertiseCallback? = null
    private val pendingSockets = java.util.concurrent.ConcurrentHashMap<String, Socket>()

    override fun getName(): String {
        return "FlinchNetwork"
    }

    @ReactMethod
    fun addListener(eventName: String) {
        // Keep: Required for RN built-in Event Emitter Calls.
    }

    @ReactMethod
    fun removeListeners(count: Int) {
        // Keep: Required for RN built-in Event Emitter Calls.
    }

    private fun getLocalIpAddress(): String? {
        try {
            val interfaces = java.net.NetworkInterface.getNetworkInterfaces()
            while (interfaces.hasMoreElements()) {
                val iface = interfaces.nextElement()
                // Filter for Wi-Fi (wlan0) or similar, usually has a specific name or just check
                // for non-loopback
                if (iface.isLoopback || !iface.isUp) continue

                val addresses = iface.inetAddresses
                while (addresses.hasMoreElements()) {
                    val addr = addresses.nextElement()
                    if (addr is java.net.Inet4Address) {
                        return addr.hostAddress
                    }
                }
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
        return null
    }

    @ReactMethod
    fun startServer(promise: Promise) {
        executor.execute {
            try {
                if (tcpSocket != null && !tcpSocket!!.isClosed) {
                    tcpSocket!!.close()
                }

                // 0 lets the system pick a free port
                val serverSocket = java.net.ServerSocket(0)
                val port = serverSocket.localPort
                val ip = getLocalIpAddress() ?: "0.0.0.0"

                promise.resolve("$ip:$port")

                // Listen for connections in a loop
                while (!serverSocket.isClosed) {
                    try {
                        val clientSocket = serverSocket.accept()
                        handleIncomingConnection(clientSocket)
                    } catch (e: Exception) {
                        if (!serverSocket.isClosed) {
                            e.printStackTrace()
                        }
                    }
                }
            } catch (e: Exception) {
                promise.reject("SERVER_START_FAILED", e)
            }
        }
    }

    private fun handleIncomingConnection(socket: Socket) {
        executor.execute {
            try {
                android.util.Log.d("FlinchNetwork", "New incoming connection accepted")
                val inputStream = socket.getInputStream()

                // Read Header
                val headerBuffer = java.io.ByteArrayOutputStream()
                var headerParsed = false
                var fileName = "unknown"
                var fileSize = 0L

                // Read byte by byte until we find "::" twice
                // Limit header size to avoid DoS
                var bytesReadCount = 0
                while (!headerParsed && bytesReadCount < 4096) {
                    val b = inputStream.read()
                    if (b == -1) break
                    headerBuffer.write(b)
                    bytesReadCount++

                    val data = headerBuffer.toString("UTF-8")
                    if (data.contains("::") && data.indexOf("::", data.indexOf("::") + 2) != -1) {
                        android.util.Log.d("FlinchNetwork", "Header delimiter found: $data")
                        val parts = data.split("::")
                        if (parts.size >= 2) {
                            fileName = parts[0]
                            fileSize = parts[1].toLongOrNull() ?: 0L
                            headerParsed = true
                            android.util.Log.d(
                                    "FlinchNetwork",
                                    "Header parsed: $fileName, $fileSize"
                            )
                        }
                    }
                }

                if (!headerParsed) {
                    android.util.Log.e("FlinchNetwork", "Header parsing failed or timed out")
                    socket.close()
                    return@execute
                }

                // Generate Request ID
                val requestId = UUID.randomUUID().toString()
                pendingSockets[requestId] = socket

                // Emit Request Event
                val params = com.facebook.react.bridge.Arguments.createMap()
                params.putString("requestId", requestId)
                params.putString("fileName", fileName)
                params.putString("fileSize", fileSize.toString())
                sendEvent("Flinch:TransferRequest", params)
                android.util.Log.d("FlinchNetwork", "Emitted TransferRequest: $requestId")
            } catch (e: Exception) {
                e.printStackTrace()
                android.util.Log.e("FlinchNetwork", "Error in handleIncomingConnection", e)
                try {
                    socket.close()
                } catch (ignore: Exception) {}
            }
        }
    }

    private fun sendEvent(eventName: String, params: Any?) {
        reactApplicationContext
                .getJSModule(
                        com.facebook.react.modules.core.DeviceEventManagerModule
                                        .RCTDeviceEventEmitter::class
                                .java
                )
                .emit(eventName, params)
    }

    private var activeSocket: Socket? = null

    @ReactMethod
    fun resolveTransferRequestWithMetadata(
            requestId: String,
            accept: Boolean,
            fileName: String,
            fileSizeStr: String,
            promise: Promise
    ) {
        val socket = pendingSockets.remove(requestId)
        if (socket == null) {
            promise.reject("INVALID_REQUEST", "Request ID not found or expired")
            return
        }

        executor.execute {
            try {
                val outputStream = socket.getOutputStream()
                if (accept) {
                    outputStream.write("ACCEPT::".toByteArray(Charsets.UTF_8))
                    outputStream.flush()

                    activeSocket = socket
                    val fileSize = fileSizeStr.toLongOrNull() ?: 0L
                    receiveFileBody(socket, fileName, fileSize)
                } else {
                    outputStream.write("REJECT::".toByteArray(Charsets.UTF_8))
                    outputStream.flush()
                    socket.close()
                }
                promise.resolve(null)
            } catch (e: Exception) {
                promise.reject("RESOLUTION_FAILED", e)
                try {
                    socket.close()
                } catch (ignore: Exception) {}
            }
        }
    }

    private fun receiveFileBody(socket: Socket, fileName: String, fileSize: Long) {
        try {
            val inputStream = socket.getInputStream()
            val downloadsDir =
                    android.os.Environment.getExternalStoragePublicDirectory(
                            android.os.Environment.DIRECTORY_DOWNLOADS
                    )
            var file = File(downloadsDir, fileName)

            // Handle duplicates
            var counter = 1
            val nameWithoutExt = file.nameWithoutExtension
            val ext = file.extension
            while (file.exists()) {
                file =
                        File(
                                downloadsDir,
                                "${nameWithoutExt}_$counter${if (ext.isNotEmpty()) ".$ext" else ""}"
                        )
                counter++
            }

            socket.tcpNoDelay = true
            val fileOutputStream = java.io.FileOutputStream(file)
            val outputStream = java.io.BufferedOutputStream(fileOutputStream, 65536) // 64KB buffer
            val buffer = ByteArray(65536) // 64KB buffer
            var totalReceived = 0L
            var bytesRead = inputStream.read(buffer)

            var lastUpdate = System.currentTimeMillis()

            while (bytesRead != -1) {
                outputStream.write(buffer, 0, bytesRead)
                totalReceived += bytesRead

                val now = System.currentTimeMillis()
                if (now - lastUpdate > 250) { // Update every 250ms (throttled)
                    val progress = if (fileSize > 0) (totalReceived * 100.0 / fileSize) else 0.0

                    val params = com.facebook.react.bridge.Arguments.createMap()
                    params.putDouble("progress", progress)
                    params.putString("received", totalReceived.toString())
                    params.putString("total", fileSize.toString())
                    params.putString("fileName", fileName)
                    sendEvent("Flinch:TransferProgress", params)
                    lastUpdate = now
                }

                bytesRead = inputStream.read(buffer)
            }

            outputStream.flush()
            outputStream.close()
            fileOutputStream.close()

            if (totalReceived < fileSize) {
                file.delete()
                throw Exception("Transfer incomplete: Received $totalReceived of $fileSize bytes")
            }
            activeSocket = null

            android.media.MediaScannerConnection.scanFile(
                    reactApplicationContext,
                    arrayOf(file.absolutePath),
                    null,
                    null
            )
            sendEvent("Flinch:FileReceived", "Saved to ${file.absolutePath}")
        } catch (e: Exception) {
            e.printStackTrace()
            if (activeSocket != null) { // Only emit error if not intentionally cancelled
                sendEvent("Flinch:FileError", e.message ?: "Unknown error")
            }
            try {
                socket.close()
            } catch (ignore: Exception) {}
            activeSocket = null
        }
    }

    @ReactMethod
    fun cancelTransfer(promise: Promise) {
        try {
            if (activeSocket != null && !activeSocket!!.isClosed) {
                activeSocket!!.close()
                activeSocket = null
                promise.resolve("Cancelled")
            } else if (tcpSocket != null && !tcpSocket!!.isClosed) {
                // Also check tcpSocket (sender)
                tcpSocket!!.close()
                tcpSocket = null
                promise.resolve("Cancelled")
            } else {
                promise.resolve("No active transfer")
            }
        } catch (e: Exception) {
            promise.reject("CANCEL_FAILED", e)
        }
    }

    @ReactMethod
    fun startBleAdvertising(uuidString: String, name: String, promise: Promise) {
        val context = reactApplicationContext
        val bluetoothManager =
                context.getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager
        val adapter = bluetoothManager.adapter

        if (adapter == null || !adapter.isEnabled) {
            promise.reject("BLUETOOTH_DISABLED", "Bluetooth is disabled")
            return
        }

        advertiser = adapter.bluetoothLeAdvertiser
        if (advertiser == null) {
            promise.reject("ADVERTISING_NOT_SUPPORTED", "BLE Advertising not supported")
            return
        }

        val settings =
                AdvertiseSettings.Builder()
                        .setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_LOW_LATENCY)
                        .setTxPowerLevel(AdvertiseSettings.ADVERTISE_TX_POWER_HIGH)
                        .setConnectable(true)
                        .build()

        val pUuid = ParcelUuid(UUID.fromString(uuidString))

        // Basic advertising data
        val data = AdvertiseData.Builder().setIncludeDeviceName(true).addServiceUuid(pUuid).build()

        advertiseCallback =
                object : AdvertiseCallback() {
                    override fun onStartSuccess(settingsInEffect: AdvertiseSettings) {
                        super.onStartSuccess(settingsInEffect)
                        promise.resolve("Advertising Started")
                    }

                    override fun onStartFailure(errorCode: Int) {
                        super.onStartFailure(errorCode)
                        promise.reject("ADVERTISING_FAILED", "Error code: $errorCode")
                    }
                }

        advertiser?.startAdvertising(settings, data, advertiseCallback)
    }

    @ReactMethod
    fun startBleAdvertisingWithPayload(
            uuidString: String,
            ip: String,
            port: Int,
            promise: Promise
    ) {
        val context = reactApplicationContext
        val bluetoothManager =
                context.getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager
        val adapter = bluetoothManager.adapter

        if (adapter == null || !adapter.isEnabled) {
            promise.reject("BLUETOOTH_DISABLED", "Bluetooth is disabled")
            return
        }

        advertiser = adapter.bluetoothLeAdvertiser
        if (advertiser == null) {
            promise.reject("ADVERTISING_NOT_SUPPORTED", "BLE Advertising not supported")
            return
        }

        val settings =
                AdvertiseSettings.Builder()
                        .setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_LOW_LATENCY)
                        .setTxPowerLevel(AdvertiseSettings.ADVERTISE_TX_POWER_HIGH)
                        .setConnectable(true)
                        .build()

        val pUuid = ParcelUuid(UUID.fromString(uuidString))

        // Prepare Service Data: IP (4 bytes) + Port (2 bytes)
        val ipBytes = InetAddress.getByName(ip).address
        val portBytes = byteArrayOf(((port shr 8) and 0xFF).toByte(), (port and 0xFF).toByte())
        val serviceData = ipBytes + portBytes

        // Use a separate UUID for the data key, or the same one?
        // Mac expects data under "12345678-1234-1234-1234-1234567890AC" (Connection Info UUID)
        val dataUuid = ParcelUuid(UUID.fromString("12345678-1234-1234-1234-1234567890AC"))

        val data = AdvertiseData.Builder().setIncludeDeviceName(false).addServiceUuid(pUuid).build()

        val scanResponse =
                AdvertiseData.Builder()
                        .setIncludeDeviceName(false)
                        .addServiceData(dataUuid, serviceData)
                        .build()

        advertiseCallback =
                object : AdvertiseCallback() {
                    override fun onStartSuccess(settingsInEffect: AdvertiseSettings) {
                        super.onStartSuccess(settingsInEffect)
                        promise.resolve("Advertising Started")
                    }

                    override fun onStartFailure(errorCode: Int) {
                        super.onStartFailure(errorCode)
                        promise.reject("ADVERTISING_FAILED", "Error code: $errorCode")
                    }
                }

        advertiser?.startAdvertising(settings, data, scanResponse, advertiseCallback)
    }

    @ReactMethod
    fun stopBleAdvertising(promise: Promise) {
        if (advertiser != null && advertiseCallback != null) {
            advertiser?.stopAdvertising(advertiseCallback)
            promise.resolve("Advertising Stopped")
        } else {
            promise.resolve("Not Advertising")
        }
    }

    @ReactMethod
    fun connectToHost(ip: String, port: Int, promise: Promise) {
        executor.execute {
            try {
                tcpSocket = Socket(ip, port)
                promise.resolve("Connected")
            } catch (e: Exception) {
                promise.reject("CONNECTION_FAILED", e)
            }
        }
    }

    @ReactMethod
    fun sendFileUDP(ip: String, port: Int, filePath: String, promise: Promise) {
        executor.execute {
            try {
                val file = File(filePath)
                val fis = FileInputStream(file)
                val buffer = ByteArray(65000)

                val address = InetAddress.getByName(ip)
                udpSocket = DatagramSocket()

                var bytesRead = fis.read(buffer)
                while (bytesRead != -1) {
                    val packet = DatagramPacket(buffer, bytesRead, address, port)
                    udpSocket?.send(packet)
                    bytesRead = fis.read(buffer)
                }
                fis.close()
                udpSocket?.close()
                promise.resolve("Sent")
            } catch (e: Exception) {
                promise.reject("SEND_FAILED", e)
            }
        }
    }

    @ReactMethod
    fun sendFileTCP(ip: String, port: Int, fileUri: String, promise: Promise) {
        executor.execute {
            try {
                val socket = Socket(ip, port)
                activeSocket = socket // Track active socket

                val outputStream = socket.getOutputStream()
                val inputStream = socket.getInputStream()

                val fileStream: java.io.InputStream?
                val fileName: String
                val fileSize: Long

                if (fileUri.startsWith("content://")) {
                    val uri = android.net.Uri.parse(fileUri)
                    fileStream = reactApplicationContext.contentResolver.openInputStream(uri)
                    val cursor =
                            reactApplicationContext.contentResolver.query(
                                    uri,
                                    null,
                                    null,
                                    null,
                                    null
                            )
                    val nameIndex =
                            cursor?.getColumnIndex(android.provider.OpenableColumns.DISPLAY_NAME)
                    val sizeIndex = cursor?.getColumnIndex(android.provider.OpenableColumns.SIZE)
                    cursor?.moveToFirst()
                    fileName =
                            if (nameIndex != null && nameIndex >= 0) cursor.getString(nameIndex)
                            else "unknown_file"
                    fileSize =
                            if (sizeIndex != null && sizeIndex >= 0) cursor.getLong(sizeIndex)
                            else 0
                    cursor?.close()
                } else {
                    val path = if (fileUri.startsWith("file://")) fileUri.substring(7) else fileUri
                    val file = File(path)
                    fileStream = FileInputStream(file)
                    fileName = file.name
                    fileSize = file.length()
                }

                if (fileStream == null) {
                    promise.reject("FILE_NOT_FOUND", "Could not open stream")
                    socket.close()
                    activeSocket = null
                    return@execute
                }

                // Send Header
                val header = "$fileName::$fileSize::"
                outputStream.write(header.toByteArray(Charsets.UTF_8))
                outputStream.flush()

                // Wait for ACCEPT::
                val responseBuffer = ByteArray(8) // "ACCEPT::" is 8 bytes
                val read = inputStream.read(responseBuffer)
                val response = String(responseBuffer, 0, read, Charsets.UTF_8)

                if (!response.startsWith("ACCEPT")) {
                    promise.reject("TRANSFER_REJECTED", "Receiver rejected the transfer")
                    fileStream.close()
                    socket.close()
                    activeSocket = null
                    return@execute
                }

                // Send Body
                val buffer = ByteArray(8192)
                var bytesRead = fileStream.read(buffer)
                var totalSent = 0L
                var lastUpdate = System.currentTimeMillis()

                while (bytesRead != -1) {
                    outputStream.write(buffer, 0, bytesRead)
                    totalSent += bytesRead

                    val now = System.currentTimeMillis()
                    if (now - lastUpdate > 100) {
                        val progress = if (fileSize > 0) (totalSent * 100.0 / fileSize) else 0.0

                        val params = com.facebook.react.bridge.Arguments.createMap()
                        params.putDouble("progress", progress)
                        params.putString("sent", totalSent.toString())
                        params.putString("total", fileSize.toString())
                        sendEvent("Flinch:TransferProgress", params) // Unified event name
                        lastUpdate = now
                    }

                    bytesRead = fileStream.read(buffer)
                }

                outputStream.flush()
                fileStream.close()
                socket.close()
                activeSocket = null
                promise.resolve("Sent")
            } catch (e: Exception) {
                if (activeSocket != null) {
                    promise.reject("SEND_FAILED", e)
                } else {
                    promise.reject("CANCELLED", "Transfer cancelled")
                }
                activeSocket = null
            }
        }
    }
}

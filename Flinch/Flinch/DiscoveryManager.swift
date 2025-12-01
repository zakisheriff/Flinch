import CoreBluetooth
import Combine

class DiscoveryManager: NSObject, ObservableObject {
    private var centralManager: CBCentralManager!
    private var peripheralManager: CBPeripheralManager!
    
    @Published var isScanning: Bool = false
    @Published var discoveredPeers: [Peer] = []
    
    private let serviceUUID = CBUUID(string: "12345678-1234-1234-1234-1234567890AB")
    var connectionInfoData: Data?
    
    private var connectionCharacteristic: CBMutableCharacteristic?
    
    override init() {
        super.init()
        centralManager = CBCentralManager(delegate: self, queue: nil)
        peripheralManager = CBPeripheralManager(delegate: self, queue: nil)
        startPruningTimer()
    }
    
    private func setupService() {
        // Characteristic for Connection Info (IP:Port)
        // UUID: ...AC (arbitrary, derived from service UUID)
        let charUUID = CBUUID(string: "12345678-1234-1234-1234-1234567890AC")
        connectionCharacteristic = CBMutableCharacteristic(
            type: charUUID,
            properties: [.read],
            value: nil,
            permissions: [.readable]
        )
        
        let service = CBMutableService(type: serviceUUID, primary: true)
        service.characteristics = [connectionCharacteristic!]
        
        peripheralManager.add(service)
    }
    
    func updateConnectionInfo(ip: String, port: UInt16) {
        let infoString = "\(ip):\(port)"
        print("Updating Connection Info: \(infoString)")
        self.connectionInfoData = infoString.data(using: .utf8)
        
        // Restart advertising with new info
        if peripheralManager.state == .poweredOn {
            stopAdvertising()
            startAdvertising()
        }
    }
    
    // Helper to convert IP string to Data (4 bytes)
    private func ipToData(_ ip: String) -> Data? {
        var addr = in_addr()
        guard ip.withCString({ inet_pton(AF_INET, $0, &addr) }) == 1 else {
            return nil
        }
        return Data(bytes: &addr, count: MemoryLayout<in_addr>.size)
    }
    
    func startAdvertising() {
        guard peripheralManager.state == .poweredOn else {
            print("Peripheral Manager not powered on")
            return
        }
        
        var advertisementData: [String: Any] = [
            CBAdvertisementDataLocalNameKey: "Flinch",
            CBAdvertisementDataServiceUUIDsKey: [serviceUUID]
        ]
        
        // Add Service Data if available
        // Service Data is not supported on macOS advertisement in this context and causes a crash.
        // We rely on the Android app connecting to read the characteristic (fallback mechanism).
        /*
        if let data = connectionInfoData, let infoString = String(data: data, encoding: .utf8) {
            let parts = infoString.split(separator: ":")
            if parts.count == 2, let port = UInt16(parts[1]), let ipData = ipToData(String(parts[0])) {
                var serviceData = ipData
                // Append Port (Big Endian)
                serviceData.append(UInt8((port >> 8) & 0xFF))
                serviceData.append(UInt8(port & 0xFF))
                
                let dataUUID = CBUUID(string: "12345678-1234-1234-1234-1234567890AC")
                advertisementData[CBAdvertisementDataServiceDataKey] = [dataUUID: serviceData]
            }
        }
        */
        
        peripheralManager.startAdvertising(advertisementData)
    }
    
    func stopAdvertising() {
        peripheralManager.stopAdvertising()
    }
    
    func startScanning() {
        print("Starting BLE Scanning...")
        isScanning = true
        centralManager.scanForPeripherals(withServices: [serviceUUID], options: [CBCentralManagerScanOptionAllowDuplicatesKey: true])
    }
    
    func stopScanning() {
        isScanning = false
        centralManager.stopScan()
    }
    
    func addManualPeer(ip: String, port: UInt16, name: String = "Manual Device") {
        let peer = Peer(id: UUID(), name: "\(name) (\(ip))", platform: "Android", ip: ip, port: port)
        DispatchQueue.main.async {
            if !self.discoveredPeers.contains(where: { $0.ip == ip }) {
                self.discoveredPeers.append(peer)
            }
        }
    }
}

extension DiscoveryManager: CBCentralManagerDelegate {
    func centralManagerDidUpdateState(_ central: CBCentralManager) {
        if central.state == .poweredOn {
            startScanning()
        }
    }
    
    func centralManager(_ central: CBCentralManager, didDiscover peripheral: CBPeripheral, advertisementData: [String : Any], rssi RSSI: NSNumber) {
        // Parse advertisement data to extract name and platform
        let name = advertisementData[CBAdvertisementDataLocalNameKey] as? String ?? peripheral.name ?? "Unknown"
        
        var ip: String?
        var port: UInt16?
        
        // Parse Service Data for IP:Port
        if let serviceDataDict = advertisementData[CBAdvertisementDataServiceDataKey] as? [CBUUID: Data] {
            let dataUUID = CBUUID(string: "12345678-1234-1234-1234-1234567890AC")
            if let data = serviceDataDict[dataUUID], data.count >= 6 {
                // Parse IP (4 bytes)
                let ipBytes = [UInt8](data.subdata(in: 0..<4))
                ip = ipBytes.map { String($0) }.joined(separator: ".")
                
                // Parse Port (2 bytes, Big Endian)
                let portBytes = [UInt8](data.subdata(in: 4..<6))
                port = (UInt16(portBytes[0]) << 8) | UInt16(portBytes[1])
                
                print("Parsed Service Data: IP=\(ip!), Port=\(port!)")
            }
        }
        
        // If we found IP/Port, we accept the peer even if name is Unknown
        if ip == nil && name == "Unknown" { return }
        
        let finalName = (name == "Unknown" && ip != nil) ? "Android Device" : name
        var peer = Peer(id: peripheral.identifier, name: finalName, platform: "Android", ip: ip, port: port)
        peer.lastSeen = Date()
        
        DispatchQueue.main.async {
            // Check if we already have a peer with this ID
            if let index = self.discoveredPeers.firstIndex(where: { $0.id == peer.id }) {
                // Update existing peer
                self.discoveredPeers[index] = peer
            } else if let index = self.discoveredPeers.firstIndex(where: { $0.name == peer.name }) {
                // Update by name match
                self.discoveredPeers[index] = peer
            } else {
                print("Adding new peer: \(name)")
                self.discoveredPeers.append(peer)
            }
        }
    }
    
    private func startPruningTimer() {
        Timer.scheduledTimer(withTimeInterval: 5.0, repeats: true) { [weak self] _ in
            guard let self = self else { return }
            let now = Date()
            DispatchQueue.main.async {
                self.discoveredPeers.removeAll { peer in
                    let isStale = now.timeIntervalSince(peer.lastSeen) > 10.0
                    if isStale {
                        print("Removing stale peer: \(peer.name)")
                    }
                    return isStale
                }
            }
        }
    }
}

extension DiscoveryManager: CBPeripheralManagerDelegate {
    func peripheralManagerDidUpdateState(_ peripheral: CBPeripheralManager) {
        if peripheral.state == .poweredOn {
            print("Peripheral Manager Powered On")
            // Re-add service to ensure it's registered
            peripheral.removeAllServices()
            setupService()
            startAdvertising()
        } else {
            print("Peripheral Manager State: \(peripheral.state.rawValue)")
        }
    }
    
    func peripheralManagerDidStartAdvertising(_ peripheral: CBPeripheralManager, error: Error?) {
        if let error = error {
            print("Failed to start advertising: \(error.localizedDescription)")
        }
    }
    
    func peripheralManager(_ peripheral: CBPeripheralManager, didAdd service: CBService, error: Error?) {
        if let error = error {
            print("Error adding service: \(error)")
        } else {
            print("Service added: \(service.uuid)")
        }
    }
    
    // Handle Read Requests from Android
    func peripheralManager(_ peripheral: CBPeripheralManager, didReceiveRead request: CBATTRequest) {
        if request.characteristic.uuid.uuidString == "12345678-1234-1234-1234-1234567890AC" {
            // Get current IP/Port from AppState/NetworkManager? 
            // Ideally DiscoveryManager should have this info.
            // For now, let's assume we store it in a property.
            
            if let data = self.connectionInfoData {
                if request.offset > data.count {
                    peripheral.respond(to: request, withResult: .invalidOffset)
                    return
                }
                request.value = data.subdata(in: request.offset..<data.count)
                peripheral.respond(to: request, withResult: .success)
            } else {
                peripheral.respond(to: request, withResult: .unlikelyError)
            }
        }
    }
}

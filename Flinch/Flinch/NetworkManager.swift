import Network
import Combine
import Foundation


enum ReceiveState: Sendable {
    case readingHeader
    case waitingForApproval
    case readingBody
}

class FileReceiver {
    let id = UUID()
    let connection: NWConnection
    
    var state: ReceiveState = .readingHeader
    var receivedData = Data() // Only used for header buffering
    var currentFileName: String = "unknown"
    var currentFileSize: Int64 = 0
    var totalBytesReceived: Int64 = 0
    
    var tempFileURL: URL?
    var fileHandle: FileHandle?
    
    var onRequest: ((NetworkManager.TransferRequest) -> Void)?
    var onPairingRequest: ((String) -> Bool)? // For verifying code (Receiver)
    var onPairingInitiated: ((String, UInt16) -> Void)? // For generating code (Receiver)
    var onProgress: ((Double) -> Void)?
    var onComplete: (() -> Void)?
    var onCancel: (() -> Void)?
    
    init(connection: NWConnection) {
        self.connection = connection
    }
    
    func start() {
        connection.start(queue: .global())
        receive()
    }
    
    private func receive() {
        connection.receive(minimumIncompleteLength: 1, maximumLength: 65536) { [weak self] content, _, isComplete, error in
            guard let self = self else { return }
            
            if let data = content, !data.isEmpty {
                self.processData(data)
            }
            if isComplete {
                print("Connection closed by sender.")
                self.finishFile()
            } else if error == nil {
                self.receive()
            } else {
                print("Error receiving: \(String(describing: error))")
                self.cleanup()
                self.onCancel?()
            }
        }
    }

    private func processData(_ data: Data) {
        switch state {
        case .readingHeader:
            receivedData.append(data)
            
            // Attempt to parse header from Data directly to avoid UTF8 issues with binary body
            // We expect: FILENAME::SIZE::
            // We look for the sequence "::" (0x3A, 0x3A)
            
            let colonColon = "::".data(using: .utf8)!
            
            // Helper to find all occurrences of "::"
            var ranges: [Range<Data.Index>] = []
            var searchRange = receivedData.startIndex..<receivedData.endIndex
            while let range = receivedData.range(of: colonColon, options: [], in: searchRange) {
                ranges.append(range)
                searchRange = range.upperBound..<receivedData.endIndex
                if ranges.count >= 2 { break } // We need at least 2 for FILENAME::SIZE::
            }
            
            // Check for PAIR_REQUEST::PORT:: (2 colons)
            // Check for PAIR_VERIFY::CODE:: (2 colons)
            // Check for FILENAME::SIZE:: (2 colons)
            
            if ranges.count >= 2 {
                // We have enough delimiters to potentially be a valid header
                // We MUST use the second delimiter (index 1) as the end of the header.
                // Using .last! is dangerous because the body might contain "::" too.
                let headerEndIndex = ranges[1].upperBound
                let headerData = receivedData.subdata(in: receivedData.startIndex..<headerEndIndex)
                
                if let headerString = String(data: headerData, encoding: .utf8) {
                    let components = headerString.components(separatedBy: "::")
                    
                    // 1. PAIR_REQUEST
                    if headerString.contains("PAIR_REQUEST") && components.count >= 3 {
                         if let port = UInt16(components[1]) {
                            print("Received Pairing Request from port \(port)")
                            if let remoteIP = connection.endpoint.hostString {
                                 onPairingInitiated?(remoteIP, port)
                            }
                        }
                        receivedData = Data() // Clear
                        return
                    }
                    
                    // 2. PAIR_VERIFY
                    if headerString.contains("PAIR_VERIFY") && components.count >= 3 {
                        let code = components[1]
                        print("Received Pairing Verification with code: \(code)")
                        let success = onPairingRequest?(code) ?? false
                        sendPairResponse(success: success)
                        receivedData = Data() // Clear
                        return
                    }
                    
                    // 3. File Transfer
                    if components.count >= 3 {
                        currentFileName = components[0]
                        if let size = Int64(components[1]) {
                            currentFileSize = size
                            print("Header Parsed. FileName: \(currentFileName), Size: \(currentFileSize)")
                            
                            // Slice off the header
                            let bodyData = receivedData.subdata(in: headerEndIndex..<receivedData.count)
                            print("Initial Body Data Count: \(bodyData.count)")
                            
                            // Initialize Temp File
                            if setupTempFile() {
                                writeToTempFile(bodyData)
                                totalBytesReceived = Int64(bodyData.count)
                                receivedData = Data() // Clear buffer, we are streaming now
                                
                                state = .waitingForApproval
                                
                                let request = NetworkManager.TransferRequest(
                                    fileName: currentFileName,
                                    fileSize: currentFileSize,
                                    connection: connection,
                                    receiverId: id
                                )
                                onRequest?(request)
                            } else {
                                print("Failed to create temp file")
                                onCancel?()
                            }
                        } else {
                            print("Failed to parse file size from header: \(components[1])")
                        }
                    }
                }
            }
        case .waitingForApproval:
            // Waiting for user to accept/decline. 
            // Any data received here is likely body data sent early or buffered.
            if !data.isEmpty {
                print("Received data while waiting for approval: \(data.count) bytes")
                writeToTempFile(data)
                totalBytesReceived += Int64(data.count)
            }
            
        case .readingBody:
            writeToTempFile(data)
            totalBytesReceived += Int64(data.count)
            // print("Received body chunk: \(data.count). Total: \(totalBytesReceived)/\(currentFileSize)")
            onProgress?(Double(totalBytesReceived) / Double(currentFileSize) * 100)
            
            if totalBytesReceived >= currentFileSize {
                print("Total bytes received matches file size. Finishing.")
                finishFile()
            }
        }
    }
    
    private func setupTempFile() -> Bool {
        let tempDir = FileManager.default.temporaryDirectory
        tempFileURL = tempDir.appendingPathComponent(UUID().uuidString)
        guard let url = tempFileURL else { return false }
        
        do {
            try Data().write(to: url) // Create empty file
            fileHandle = try FileHandle(forWritingTo: url)
            print("Temp file created at: \(url.path)")
            return true
        } catch {
            print("Error creating temp file: \(error)")
            return false
        }
    }
    
    private func writeToTempFile(_ data: Data) {
        if let handle = fileHandle {
            do {
                if #available(macOS 10.15.4, *) {
                    try handle.write(contentsOf: data)
                } else {
                    handle.write(data)
                }
            } catch {
                print("Error writing to temp file: \(error)")
                cleanup()
                onCancel?()
            }
        }
    }
    
    private func cleanup() {
        try? fileHandle?.close()
        fileHandle = nil
        if let url = tempFileURL {
            try? FileManager.default.removeItem(at: url)
        }
        tempFileURL = nil
    }

    private func sendPairResponse(success: Bool) {
        let response = success ? "PAIR_ACK::" : "PAIR_FAIL::"
        connection.send(content: response.data(using: .utf8), completion: .contentProcessed { error in
            if let error = error {
                print("Error sending PAIR response: \(error)")
            }
            // Keep connection open? Usually pairing is quick.
            // If success, we might want to keep it for session, but for now let's close or reset.
            // The client will likely reconnect for file transfer or keep this open.
        })
    }
    
    func resolveRequest(accept: Bool) {
        if accept {
            let response = "ACCEPT::"
            connection.send(content: response.data(using: .utf8), completion: .contentProcessed { [weak self] error in
                guard let self = self else { return }
                if let error = error {
                    print("Error sending ACCEPT: \(error)")
                    return
                }
                print("Sent ACCEPT. Switching to readingBody.")
                self.state = .readingBody
                self.receive() // Resume receiving
            })
        } else {
            let response = "DECLINE::"
            connection.send(content: response.data(using: .utf8), completion: .contentProcessed { [weak self] _ in
                self?.cleanup()
                self?.connection.cancel()
                self?.onCancel?()
            })
        }
    }
    
    private var isFileSaved = false

    private func finishFile() {
        if isFileSaved { return } // Prevent duplicate saves
        if state == .readingHeader { return } // Didn't even start
        
        // Don't save if it's a pairing request/verify that fell through (shouldn't happen with fix)
        if currentFileName == "unknown" { return }

        print("Finishing file. Received: \(totalBytesReceived), Expected: \(currentFileSize)")

        if totalBytesReceived < currentFileSize {
            print("Transfer incomplete. Received: \(totalBytesReceived), Expected: \(currentFileSize). Discarding.")
            cleanup()
            onCancel?()
            return
        }
        
        isFileSaved = true // Mark as saved
        
        // Close handle before moving
        try? fileHandle?.close()
        fileHandle = nil
        
        guard let tempURL = tempFileURL else {
            onCancel?()
            return
        }
        
        let fileManager = FileManager.default
        if let downloadsURL = fileManager.urls(for: .downloadsDirectory, in: .userDomainMask).first {
            var destinationURL = downloadsURL.appendingPathComponent(currentFileName)
            var counter = 1
            let nameWithoutExt = (currentFileName as NSString).deletingPathExtension
            let ext = (currentFileName as NSString).pathExtension
            
            while fileManager.fileExists(atPath: destinationURL.path) {
                let newName = "\(nameWithoutExt)_\(counter)\(ext.isEmpty ? "" : ".\(ext)")"
                destinationURL = downloadsURL.appendingPathComponent(newName)
                counter += 1
            }
            
            do {
                try fileManager.moveItem(at: tempURL, to: destinationURL)
                print("File saved to: \(destinationURL.path)")
                onComplete?()
            } catch {
                print("Error saving file: \(error)")
                cleanup() // Will remove temp file
                onCancel?()
            }
        }
    }
}

class NetworkManager: ObservableObject {
    private var listener: NWListener?
    private var activeReceivers: [UUID: FileReceiver] = [:]
    
    @Published var serverIP: String = ""
    @Published var serverPort: UInt16 = 0
    @Published var serverStatus: String = "Stopped"
    
    // Callback for pairing verification
    var onPairingRequest: ((String) -> Bool)?
    // Callback for pairing initiation (generating code)
    var onPairingInitiated: ((String, UInt16) -> Void)?
    // Callback for auto-accept check
    var shouldAutoAccept: (() -> Bool)?
    
    struct TransferRequest: Identifiable {
        let id = UUID()
        let fileName: String
        let fileSize: Int64
        let connection: NWConnection
        let receiverId: UUID
    }
    
    @Published var pendingRequest: TransferRequest?
    @Published var transferProgress: Double = 0.0
    @Published var isTransferring: Bool = false
    @Published var currentTransferFileName: String = ""
    
    func startServer(port: UInt16 = 0) {
        do {
            let parameters = NWParameters.tcp
            let tcpOptions = parameters.defaultProtocolStack.transportProtocol as? NWProtocolTCP.Options
            tcpOptions?.enableKeepalive = true
            tcpOptions?.noDelay = true
            parameters.acceptLocalOnly = false
            
            if port != 0 {
                let endpointPort = NWEndpoint.Port(rawValue: port)!
                listener = try NWListener(using: parameters, on: endpointPort)
            } else {
                listener = try NWListener(using: parameters)
            }
            
            listener?.stateUpdateHandler = { newState in
                switch newState {
                case .ready:
                    if let port = self.listener?.port?.rawValue {
                        print("Server ready on port \(port)")
                        self.serverPort = port
                        self.serverStatus = "Running"
                        self.updateServerIP()
                    }
                case .failed(let error):
                    print("Server failed: \(error)")
                    self.serverStatus = "Failed"
                default:
                    break
                }
            }
            
            listener?.newConnectionHandler = { newConnection in
                print("New connection: \(newConnection)")
                self.handleConnection(newConnection)
            }
            
            listener?.start(queue: .global())
        } catch {
            print("Failed to create listener: \(error)")
        }
    }
    
    private func updateServerIP() {
        if let ip = getLocalIPAddress() {
            DispatchQueue.main.async {
                self.serverIP = ip
                print("Server IP: \(ip)")
            }
        }
    }
    
    private func getLocalIPAddress() -> String? {
        var address: String?
        var ifaddr: UnsafeMutablePointer<ifaddrs>?
        if getifaddrs(&ifaddr) == 0 {
            var ptr = ifaddr
            while ptr != nil {
                defer { ptr = ptr?.pointee.ifa_next }
                let interface = ptr?.pointee
                let addrFamily = interface?.ifa_addr.pointee.sa_family
                if addrFamily == UInt8(AF_INET) {
                    let name = String(cString: (interface?.ifa_name)!)
                    if name == "en0" {
                        var hostname = [CChar](repeating: 0, count: Int(NI_MAXHOST))
                        getnameinfo(interface?.ifa_addr, socklen_t((interface?.ifa_addr.pointee.sa_len)!),
                                    &hostname, socklen_t(hostname.count),
                                    nil, socklen_t(0), NI_NUMERICHOST)
                        address = String(cString: hostname)
                    }
                }
            }
            freeifaddrs(ifaddr)
        }
        return address
    }
    
    private func handleConnection(_ connection: NWConnection) {
        let receiver = FileReceiver(connection: connection)
        
        // Pass the pairing callbacks
        receiver.onPairingRequest = self.onPairingRequest
        receiver.onPairingInitiated = self.onPairingInitiated
        
        receiver.onRequest = { [weak self] request in
            DispatchQueue.main.async {
                guard let self = self else { return }
                
                // Check for Auto-Accept (Trusted Session)
                if let shouldAutoAccept = self.shouldAutoAccept, shouldAutoAccept() {
                    print("Auto-accepting transfer from trusted peer")
                    self.isTransferring = true
                    self.currentTransferFileName = request.fileName
                    self.transferProgress = 0.0
                    // Do NOT set pendingRequest, so no alert is shown
                    receiver.resolveRequest(accept: true)
                } else {
                    self.pendingRequest = request
                }
            }
        }
        
        receiver.onProgress = { [weak self] progress in
            DispatchQueue.main.async {
                self?.transferProgress = progress
            }
        }
        
        receiver.onComplete = { [weak self] in
            DispatchQueue.main.async {
                self?.isTransferring = false
                self?.transferProgress = 100.0
                self?.pendingRequest = nil
            }
            self?.activeReceivers.removeValue(forKey: receiver.id)
        }
        
        receiver.onCancel = { [weak self] in
            DispatchQueue.main.async {
                self?.isTransferring = false
                self?.pendingRequest = nil
            }
            self?.activeReceivers.removeValue(forKey: receiver.id)
        }
        
        activeReceivers[receiver.id] = receiver
        receiver.start()
    }
    
    func resolveRequest(accept: Bool) {
        guard let request = pendingRequest, let receiver = activeReceivers[request.receiverId] else { return }
        
        if accept {
            DispatchQueue.main.async {
                self.isTransferring = true
                self.currentTransferFileName = request.fileName
                self.transferProgress = 0.0
                self.pendingRequest = nil // Clear request immediately
            }
            receiver.resolveRequest(accept: true)
        } else {
            receiver.resolveRequest(accept: false)
            DispatchQueue.main.async {
                self.pendingRequest = nil
            }
        }
    }
    
    private var sendingConnection: NWConnection?

    func cancelTransfer() {
        print("Cancelling transfer...")
        // Cancel all active receivers
        for receiver in activeReceivers.values {
            receiver.connection.cancel()
        }
        activeReceivers.removeAll()
        
        // Cancel sending
        if let connection = sendingConnection {
            connection.cancel()
            sendingConnection = nil
        }
        
        DispatchQueue.main.async {
            self.isTransferring = false
            self.transferProgress = 0.0
            self.pendingRequest = nil
        }
    }
    
    // Queue state
    private var transferQueue: [URL] = []
    private var currentTarget: (ip: String, port: UInt16)?

    func sendFiles(urls: [URL], to ip: String, port: UInt16) {
        self.transferQueue.append(contentsOf: urls)
        self.currentTarget = (ip, port)
        
        if self.sendingConnection == nil {
            processQueue()
        }
    }
    
    private func processQueue() {
        guard !transferQueue.isEmpty, let target = currentTarget else {
            return
        }
        
        let url = transferQueue.removeFirst()
        self.sendFile(to: target.ip, port: target.port, url: url)
    }

    func sendFile(to ip: String, port: UInt16, url: URL) {
        print("Sending file to \(ip):\(port)")
        let host = NWEndpoint.Host(ip)
        let port = NWEndpoint.Port(rawValue: port)!
        let connection = NWConnection(host: host, port: port, using: .tcp)
        self.sendingConnection = connection
        
        DispatchQueue.main.async {
            self.isTransferring = true
            self.currentTransferFileName = url.lastPathComponent
            self.transferProgress = 0.0
        }
        
        connection.stateUpdateHandler = { [weak self] state in
            guard let self = self else { return }
            switch state {
            case .ready:
                print("Connected to \(ip):\(port)")
                self.sendHeader(connection: connection, url: url)
            case .failed(let error):
                print("Connection failed: \(error)")
                DispatchQueue.main.async { self.isTransferring = false }
                self.sendingConnection = nil
                self.processQueue()
            case .cancelled:
                print("Connection cancelled")
                DispatchQueue.main.async { self.isTransferring = false }
                self.sendingConnection = nil
                self.transferQueue.removeAll()
            default:
                break
            }
        }
        
        connection.start(queue: .global())
    }
    
    private func sendHeader(connection: NWConnection, url: URL) {
        do {
            let data = try Data(contentsOf: url)
            let filename = url.lastPathComponent
            let filesize = data.count
            
            let header = "\(filename)::\(filesize)::"
            if let headerData = header.data(using: .utf8) {
                connection.send(content: headerData, completion: .contentProcessed { error in
                    if let error = error {
                        print("Error sending header: \(error)")
                        return
                    }
                    print("Header sent, waiting for ACCEPT...")
                    
                    connection.receive(minimumIncompleteLength: 1, maximumLength: 1024) { content, _, _, error in
                        if let error = error {
                            print("Error receiving ACCEPT: \(error)")
                            connection.cancel()
                            DispatchQueue.main.async { self.isTransferring = false }
                            self.processQueue()
                            return
                        }
                        
                        if let responseData = content, let response = String(data: responseData, encoding: .utf8) {
                            print("Received response: \(response)")
                            if response.contains("ACCEPT::") {
                                print("Receiver accepted. Sending body...")
                                self.sendBody(connection: connection, data: data)
                            } else {
                                print("Receiver declined or invalid response: \(response)")
                                connection.cancel()
                                DispatchQueue.main.async { self.isTransferring = false }
                                self.processQueue()
                            }
                        } else {
                            print("No response data or decoding failed")
                        }
                    }
                })
            }
        } catch {
            print("Error reading file: \(error)")
            DispatchQueue.main.async { self.isTransferring = false }
            self.processQueue()
        }
    }
    
    private func sendBody(connection: NWConnection, data: Data) {
        let chunkSize = 65536
        let totalSize = data.count
        var offset = 0
        
        func sendNextChunk() {
            guard offset < totalSize else {
                print("Body sent completely")
                DispatchQueue.main.async {
                    self.transferProgress = 100.0
                    if self.transferQueue.isEmpty {
                        self.isTransferring = false
                        self.currentTarget = nil
                    } else {
                        self.processQueue()
                    }
                }
                connection.cancel()
                self.sendingConnection = nil
                return
            }
            
            if self.sendingConnection == nil {
                print("Transfer cancelled during send")
                return
            }
            
            let endIndex = min(offset + chunkSize, totalSize)
            let chunk = data.subdata(in: offset..<endIndex)
            
            connection.send(content: chunk, completion: .contentProcessed { error in
                if let error = error {
                    print("Error sending chunk: \(error)")
                    connection.cancel()
                    self.sendingConnection = nil
                    DispatchQueue.main.async { self.isTransferring = false }
                    return
                }
                
                offset += chunk.count
                let progress = Double(offset) / Double(totalSize) * 100
                
                DispatchQueue.main.async {
                    self.transferProgress = progress
                }
                
                sendNextChunk()
            })
        }
        
        sendNextChunk()
    }
    
    func sendPairingRequest(to ip: String, port: UInt16, completion: @escaping (Bool) -> Void) {
        print("Sending PAIR_REQUEST to \(ip):\(port)")
        let host = NWEndpoint.Host(ip)
        let port = NWEndpoint.Port(rawValue: port)!
        let connection = NWConnection(host: host, port: port, using: .tcp)
        
        connection.stateUpdateHandler = { state in
            switch state {
            case .ready:
                // Include serverPort so the other device knows where to connect back
                let request = "PAIR_REQUEST::\(self.serverPort)::"
                connection.send(content: request.data(using: .utf8), completion: .contentProcessed { error in
                    if let error = error {
                        print("Error sending PAIR_REQUEST: \(error)")
                        completion(false)
                        connection.cancel()
                        return
                    }
                    // We don't expect a response immediately, the user needs to see the code on the other device.
                    // Actually, we just fire and forget here? Or wait for ack?
                    // Android side emits event.
                    // We can close connection or keep it.
                    // Let's close it for now, as the verification will open a new one or we can reuse.
                    // But wait, if we close, how do we verify?
                    // Verification is a separate step: User enters code -> We send PAIR_VERIFY.
                    print("PAIR_REQUEST sent successfully")
                    completion(true)
                    connection.cancel()
                })
            case .failed(let error):
                print("Connection failed for PAIR_REQUEST: \(error)")
                completion(false)
                connection.cancel()
            default:
                break
            }
        }
        connection.start(queue: .global())
    }
    
    func sendPairingVerification(code: String, to ip: String, port: UInt16, completion: @escaping (Bool) -> Void) {
        print("Sending PAIR_VERIFY to \(ip):\(port) with code \(code)")
        let host = NWEndpoint.Host(ip)
        let port = NWEndpoint.Port(rawValue: port)!
        let connection = NWConnection(host: host, port: port, using: .tcp)
        
        connection.stateUpdateHandler = { state in
            switch state {
            case .ready:
                // Include serverPort in the verification message so the other device knows where to connect back
                let request = "PAIR_VERIFY::\(code)::\(self.serverPort)::"
                connection.send(content: request.data(using: .utf8), completion: .contentProcessed { error in
                    if let error = error {
                        print("Error sending PAIR_VERIFY: \(error)")
                        completion(false)
                        connection.cancel()
                        return
                    }
                    
                    // Wait for PAIR_ACK or PAIR_FAIL
                    connection.receive(minimumIncompleteLength: 1, maximumLength: 1024) { content, _, _, error in
                        if let data = content, let response = String(data: data, encoding: .utf8) {
                            if response.contains("PAIR_ACK::") {
                                print("Pairing Successful!")
                                completion(true)
                            } else {
                                print("Pairing Failed: \(response)")
                                completion(false)
                            }
                        } else {
                            print("Error receiving pairing response: \(String(describing: error))")
                            completion(false)
                        }
                        connection.cancel()
                    }
                })
            case .failed(let error):
                print("Connection failed for PAIR_VERIFY: \(error)")
                completion(false)
                connection.cancel()
            default:
                break
            }
        }
        connection.start(queue: .global())
    }
}



extension NWEndpoint {
    var hostString: String? {
        switch self {
        case .hostPort(let host, _):
            switch host {
            case .ipv4(let ipv4):
                // ipv4.debugDescription returns "x.x.x.x" (or similar, verifying)
                // Actually, IPv4Address doesn't have a simple .ipString property in Network framework?
                // It conforms to CustomDebugStringConvertible.
                // Let's use a safer way if possible, but debugDescription usually works.
                // A better way:
                return ipv4.rawValue.withUnsafeBytes { ptr in
                    var addr = in_addr(s_addr: ptr.load(as: UInt32.self))
                    var buffer = [CChar](repeating: 0, count: Int(INET_ADDRSTRLEN))
                    inet_ntop(AF_INET, &addr, &buffer, socklen_t(INET_ADDRSTRLEN))
                    return String(cString: buffer)
                }
            case .ipv6(let ipv6):
                 return ipv6.rawValue.withUnsafeBytes { ptr in
                    var addr = in6_addr()
                    withUnsafeMutableBytes(of: &addr) { addrPtr in
                        addrPtr.copyMemory(from: ptr)
                    }
                    var buffer = [CChar](repeating: 0, count: Int(INET6_ADDRSTRLEN))
                    inet_ntop(AF_INET6, &addr, &buffer, socklen_t(INET6_ADDRSTRLEN))
                    return String(cString: buffer)
                }
            case .name(let name, _):
                return name
            default:
                return nil
            }
        default:
            return nil
        }
    }
}

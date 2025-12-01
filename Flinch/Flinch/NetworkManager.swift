import Network
import Combine
import Foundation

class NetworkManager: ObservableObject {
    private var listener: NWListener?
    private var connections: [NWConnection] = []
    
    @Published var serverIP: String = ""
    @Published var serverPort: UInt16 = 0
    @Published var serverStatus: String = "Stopped"
    
    // Handshake & Progress State
    struct TransferRequest: Identifiable {
        let id = UUID()
        let fileName: String
        let fileSize: Int64
        let connection: NWConnection
    }
    
    @Published var pendingRequest: TransferRequest?
    @Published var transferProgress: Double = 0.0
    @Published var isTransferring: Bool = false
    @Published var currentTransferFileName: String = ""
    
    func startServer(port: UInt16 = 0) { // 0 means let OS choose a port
        do {
            let parameters = NWParameters.tcp
            let tcpOptions = parameters.defaultProtocolStack.transportProtocol as? NWProtocolTCP.Options
            tcpOptions?.enableKeepalive = true
            tcpOptions?.noDelay = true
            
            // Allow connection from any interface
            parameters.acceptLocalOnly = false
            
            // If specific port requested, use it
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
    
    // Helper to get local Wi-Fi IP
    private func getLocalIPAddress() -> String? {
        var address: String?
        var ifaddr: UnsafeMutablePointer<ifaddrs>?
        
        if getifaddrs(&ifaddr) == 0 {
            var ptr = ifaddr
            while ptr != nil {
                defer { ptr = ptr?.pointee.ifa_next }
                
                let interface = ptr?.pointee
                let addrFamily = interface?.ifa_addr.pointee.sa_family
                
                // Check for IPv4 only
                if addrFamily == UInt8(AF_INET) {
                    let name = String(cString: (interface?.ifa_name)!)
                    // en0 is usually Wi-Fi on Mac
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
        connection.start(queue: .global())
        self.connections.append(connection)
        receive(on: connection)
    }
    
    private enum ReceiveState {
        case readingHeader
        case waitingForApproval
        case readingBody
    }
    
    private var state: ReceiveState = .readingHeader
    private var receivedData = Data()
    private var currentFileName: String = "unknown"
    private var currentFileSize: Int64 = 0
    private var totalBytesReceived: Int64 = 0
    private var currentConnection: NWConnection?
    
    private func receive(on connection: NWConnection) {
        connection.receive(minimumIncompleteLength: 1, maximumLength: 65536) { content, contentContext, isComplete, error in
            if let data = content, !data.isEmpty {
                self.processData(data, connection: connection)
            }
            if isComplete {
                print("Connection closed by sender.")
                self.finishFile()
            } else if error == nil {
                // Continue receiving only if not waiting for approval
                if self.state != .waitingForApproval {
                    self.receive(on: connection)
                }
            } else {
                print("Receive error: \(error!)")
            }
        }
    }
    
    private func processData(_ data: Data, connection: NWConnection) {
        switch state {
        case .readingHeader:
            receivedData.append(data)
            // Look for delimiter "::" twice. Format: filename::size::
            if let range1 = receivedData.range(of: "::".data(using: .utf8)!),
               let range2 = receivedData.range(of: "::".data(using: .utf8)!, options: [], in: range1.upperBound..<receivedData.endIndex) {
                
                let filenameData = receivedData.subdata(in: 0..<range1.lowerBound)
                let sizeData = receivedData.subdata(in: range1.upperBound..<range2.lowerBound)
                
                if let filename = String(data: filenameData, encoding: .utf8),
                   let sizeString = String(data: sizeData, encoding: .utf8),
                   let size = Int64(sizeString) {
                    
                    self.currentFileName = filename
                    self.currentFileSize = size
                    self.currentConnection = connection
                    print("Header parsed: File=\(filename), Size=\(size)")
                    
                    // Store remaining data (start of body)
                    let remainingData = receivedData.subdata(in: range2.upperBound..<receivedData.endIndex)
                    self.receivedData = Data() 
                    if !remainingData.isEmpty {
                        self.receivedData.append(remainingData)
                        self.totalBytesReceived += Int64(remainingData.count)
                    }
                    
                    // Move to waiting state and notify UI
                    self.state = .waitingForApproval
                    DispatchQueue.main.async {
                        self.pendingRequest = TransferRequest(fileName: filename, fileSize: size, connection: connection)
                    }
                }
            }
        case .waitingForApproval:
            // Should not happen as we stop receiving, but buffer might have data
            print("Received data while waiting for approval")
            
        case .readingBody:
            receivedData.append(data)
            totalBytesReceived += Int64(data.count)
            
            let progress = Double(totalBytesReceived) / Double(currentFileSize) * 100
            DispatchQueue.main.async {
                self.transferProgress = progress
            }
            print("Progress: \(totalBytesReceived)/\(currentFileSize)")
        }
    }
    
    func resolveRequest(accept: Bool) {
        guard let request = pendingRequest else { return }
        
        if accept {
            print("Transfer accepted")
            // Send ACCEPT::
            let response = "ACCEPT::"
            request.connection.send(content: response.data(using: .utf8), completion: .contentProcessed { error in
                if let error = error {
                    print("Error sending ACCEPT: \(error)")
                    return
                }
                print("Sent ACCEPT")
                
                self.state = .readingBody
                self.pendingRequest = nil
                
                DispatchQueue.main.async {
                    self.isTransferring = true
                    self.currentTransferFileName = request.fileName
                    self.transferProgress = 0.0
                }
                
                // Resume receiving
                self.receive(on: request.connection)
            })
        } else {
            print("Transfer declined")
            // Send DECLINE:: or just close
            let response = "DECLINE::"
            request.connection.send(content: response.data(using: .utf8), completion: .contentProcessed { _ in
                request.connection.cancel()
                self.pendingRequest = nil
                self.state = .readingHeader
                self.receivedData = Data()
            })
        }
    }
    
    private func finishFile() {
        if receivedData.isEmpty && state == .readingHeader { return }
        
        DispatchQueue.main.async {
            self.isTransferring = false
            self.transferProgress = 100.0
        }
        
        // Verify file size
        if totalBytesReceived < currentFileSize {
            print("Transfer incomplete: Received \(totalBytesReceived) of \(currentFileSize) bytes. Discarding.")
            // Reset state
            self.state = .readingHeader
            self.receivedData = Data()
            self.totalBytesReceived = 0
            return
        }
        
        let fileManager = FileManager.default
        
        if let downloadsURL = fileManager.urls(for: .downloadsDirectory, in: .userDomainMask).first {
            var destinationURL = downloadsURL.appendingPathComponent(currentFileName)
            
            // Handle duplicates
            var counter = 1
            let nameWithoutExt = (currentFileName as NSString).deletingPathExtension
            let ext = (currentFileName as NSString).pathExtension
            
            while fileManager.fileExists(atPath: destinationURL.path) {
                let newName = "\(nameWithoutExt)_\(counter)\(ext.isEmpty ? "" : ".\(ext)")"
                destinationURL = downloadsURL.appendingPathComponent(newName)
                counter += 1
            }
            
            do {
                try receivedData.write(to: destinationURL)
                print("File saved to: \(destinationURL.path)")
                
                // Notify UI of success?
                // For now, just reset state
                self.state = .readingHeader
                self.receivedData = Data()
                self.totalBytesReceived = 0
                
                // Send success notification if needed
            } catch {
                print("Error saving file: \(error)")
            }
        }
    }

    
    private var sendingConnection: NWConnection?

    func cancelTransfer() {
        print("Cancelling transfer...")
        
        // Cancel receiving
        if let connection = currentConnection {
            connection.cancel()
            currentConnection = nil
        }
        
        // Cancel sending
        if let connection = sendingConnection {
            connection.cancel()
            sendingConnection = nil
        }
        
        // Reset state
        DispatchQueue.main.async {
            self.isTransferring = false
            self.transferProgress = 0.0
            self.pendingRequest = nil
        }
        
        // Reset receiver state
        self.state = .readingHeader
        self.receivedData = Data()
        self.totalBytesReceived = 0
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
            case .cancelled:
                print("Connection cancelled")
                DispatchQueue.main.async { self.isTransferring = false }
                self.sendingConnection = nil
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
            
            // Header: filename::size::
            let header = "\(filename)::\(filesize)::"
            if let headerData = header.data(using: .utf8) {
                connection.send(content: headerData, completion: .contentProcessed { error in
                    if let error = error {
                        print("Error sending header: \(error)")
                        return
                    }
                    print("Header sent, waiting for ACCEPT...")
                    
                    // Wait for ACCEPT::
                    connection.receive(minimumIncompleteLength: 1, maximumLength: 1024) { content, _, _, error in
                        if let responseData = content, let response = String(data: responseData, encoding: .utf8) {
                            if response.contains("ACCEPT::") {
                                print("Receiver accepted. Sending body...")
                                self.sendBody(connection: connection, data: data)
                            } else {
                                print("Receiver declined or invalid response: \(response)")
                                connection.cancel()
                                DispatchQueue.main.async { self.isTransferring = false }
                            }
                        } else if let error = error {
                            print("Error receiving response: \(error)")
                        }
                    }
                })
            }
        } catch {
            print("Error reading file: \(error)")
            DispatchQueue.main.async { self.isTransferring = false }
        }
    }
    
    private func sendBody(connection: NWConnection, data: Data) {
        let chunkSize = 65536 // 64KB chunks
        let totalSize = data.count
        var offset = 0
        
        func sendNextChunk() {
            guard offset < totalSize else {
                print("Body sent completely")
                DispatchQueue.main.async {
                    self.transferProgress = 100.0
                    self.isTransferring = false
                }
                connection.cancel()
                self.sendingConnection = nil
                return
            }
            
            // Check for cancellation
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
                
                // Send next chunk
                sendNextChunk()
            })
        }
        
        sendNextChunk()
    }
}


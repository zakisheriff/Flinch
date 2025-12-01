import Network
import Combine
import Foundation

class NetworkManager: ObservableObject {
    private var listener: NWListener?
    private var connections: [NWConnection] = []
    
    @Published var serverIP: String = ""
    @Published var serverPort: UInt16 = 0
    @Published var serverStatus: String = "Stopped"
    
    func startServer(port: UInt16 = 0) { // 0 means let OS choose a port
        do {
            let parameters = NWParameters.tcp
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
        case readingBody
    }
    
    private var state: ReceiveState = .readingHeader
    private var receivedData = Data()
    private var currentFileName: String = "unknown"
    private var currentFileSize: Int64 = 0
    private var totalBytesReceived: Int64 = 0
    
    private func receive(on connection: NWConnection) {
        connection.receive(minimumIncompleteLength: 1, maximumLength: 65536) { content, contentContext, isComplete, error in
            if let data = content, !data.isEmpty {
                self.processData(data)
            }
            if isComplete {
                print("Connection closed by sender.")
                self.finishFile()
            } else if error == nil {
                self.receive(on: connection)
            } else {
                print("Receive error: \(error!)")
            }
        }
    }
    
    private func processData(_ data: Data) {
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
                    print("Header parsed: File=\(filename), Size=\(size)")
                    
                    // Move to body state
                    self.state = .readingBody
                    
                    // Process remaining data as body
                    let remainingData = receivedData.subdata(in: range2.upperBound..<receivedData.endIndex)
                    self.receivedData = Data() // Clear buffer for body
                    if !remainingData.isEmpty {
                        self.receivedData.append(remainingData)
                        self.totalBytesReceived += Int64(remainingData.count)
                    }
                }
            }
        case .readingBody:
            receivedData.append(data)
            totalBytesReceived += Int64(data.count)
            print("Progress: \(totalBytesReceived)/\(currentFileSize)")
        }
    }
    
    private func finishFile() {
        if receivedData.isEmpty && state == .readingHeader { return }
        
        let fileManager = FileManager.default
        
        if let downloadsURL = fileManager.urls(for: .downloadsDirectory, in: .userDomainMask).first {
            // Ensure unique filename
            var fileURL = downloadsURL.appendingPathComponent(currentFileName)
            var counter = 1
            while fileManager.fileExists(atPath: fileURL.path) {
                let nameWithoutExt = (currentFileName as NSString).deletingPathExtension
                let ext = (currentFileName as NSString).pathExtension
                let newName = "\(nameWithoutExt)_\(counter).\(ext)"
                fileURL = downloadsURL.appendingPathComponent(newName)
                counter += 1
            }
            
            do {
                try receivedData.write(to: fileURL)
                print("File saved to: \(fileURL.path)")
                
                DispatchQueue.main.async {
                    // Reset for next file
                    self.receivedData = Data()
                    self.state = .readingHeader
                    self.totalBytesReceived = 0
                }
            } catch {
                print("Error saving file: \(error)")
            }
        }
    }

    
    func sendFile(to ip: String, port: UInt16, url: URL) {
        print("Sending file to \(ip):\(port)")
        let host = NWEndpoint.Host(ip)
        let port = NWEndpoint.Port(rawValue: port)!
        let connection = NWConnection(host: host, port: port, using: .tcp)
        
        connection.stateUpdateHandler = { [weak self] state in
            guard let self = self else { return }
            switch state {
            case .ready:
                print("Connected to \(ip):\(port)")
                self.sendData(connection: connection, url: url)
            case .failed(let error):
                print("Connection failed: \(error)")
            default:
                break
            }
        }
        
        connection.start(queue: .global())
    }
    
    private func sendData(connection: NWConnection, url: URL) {
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
                    print("Header sent")
                    
                    // Send Body
                    connection.send(content: data, completion: .contentProcessed { error in
                        if let error = error {
                            print("Error sending body: \(error)")
                        } else {
                            print("Body sent")
                        }
                        connection.cancel()
                    })
                })
            }
        } catch {
            print("Error reading file: \(error)")
        }
    }
}


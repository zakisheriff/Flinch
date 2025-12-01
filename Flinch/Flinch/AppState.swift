import SwiftUI
import Combine

class AppState: ObservableObject {
    @Published var currentTab: Tab? = .home
    @Published var isHosting: Bool = false
    @Published var connectedPeers: [Peer] = []
    @Published var activeTransfers: [TransferTask] = []
    
    // Transfer State
    @Published var pendingRequest: NetworkManager.TransferRequest?
    @Published var transferProgress: Double = 0.0
    @Published var isTransferring: Bool = false
    @Published var currentTransferFileName: String = ""
    
    let discoveryManager = DiscoveryManager()
    let networkManager = NetworkManager()
    let pairingManager = PairingManager()
    
    init() {
        setupBindings()
    }
    
    private func setupBindings() {
        discoveryManager.$discoveredPeers
            .receive(on: RunLoop.main)
            .assign(to: &$connectedPeers)
            
        // When Server IP or Port changes, update DiscoveryManager
        networkManager.$serverIP.combineLatest(networkManager.$serverPort)
            .sink { [weak self] ip, port in
                if !ip.isEmpty && port != 0 {
                    self?.discoveryManager.updateConnectionInfo(ip: ip, port: port)
                }
            }
            .store(in: &cancellables)
            
        // Bind NetworkManager state to AppState
        networkManager.$pendingRequest
            .receive(on: RunLoop.main)
            .assign(to: &$pendingRequest)
            
        networkManager.$transferProgress
            .receive(on: RunLoop.main)
            .assign(to: &$transferProgress)
            
        networkManager.$isTransferring
            .receive(on: RunLoop.main)
            .assign(to: &$isTransferring)
            
        networkManager.$currentTransferFileName
            .receive(on: RunLoop.main)
            .assign(to: &$currentTransferFileName)
            
        networkManager.$transferHistory
            .receive(on: RunLoop.main)
            .map { historyItems in
                historyItems.map { item in
                    TransferTask(
                        id: item.id,
                        fileName: item.fileName,
                        progress: item.progress / 100.0, // Convert 0-100 to 0.0-1.0
                        speed: item.state == .completed ? "Completed" : (item.state == .failed ? "Failed" : "Transferring..."),
                        isIncoming: item.isIncoming
                    )
                }
            }
            .assign(to: &$activeTransfers)
            
        // Handle Pairing Requests
        networkManager.onPairingRequest = { [weak self] code in
            guard let self = self else { return false }
            // Verify code on main thread if needed, but verifyCode updates published vars
            // so we should probably do it on main thread or ensure thread safety.
            // Since onPairingRequest is called from background in NetworkManager, 
            // we should be careful. 
            // But verifyCode just checks a string.
            // However, it updates @Published vars.
            
            var result = false
            DispatchQueue.main.sync {
                result = self.pairingManager.verifyCode(code)
            }
            return result
        }
        
        // Handle Pairing Initiation (Generate Code)
        networkManager.onPairingInitiated = { [weak self] ip, port in
            DispatchQueue.main.async {
                self?.pairingManager.generateCode()
                self?.pairingManager.setRemotePeer(ip: ip, port: port)
            }
        }
        
        // Observe Authentication Success to add peer manually
        pairingManager.$isAuthenticated
            .sink { [weak self] isAuthenticated in
                if isAuthenticated {
                    if let peer = self?.pairingManager.targetPeer, let ip = peer.ip, let port = peer.port {
                        // Add to discovery list so it shows up in grid
                        // We might want to get the real name, but for now "Linked Device" or similar is fine
                        // Or we can request name?
                        self?.discoveryManager.addManualPeer(ip: ip, port: port, name: "Linked Device")
                    }
                }
            }
            .store(in: &cancellables)
        
        // Handle Auto-Accept
        networkManager.shouldAutoAccept = { [weak self] in
            return self?.pairingManager.isAuthenticated ?? false
        }
            
        // Start server on launch
        networkManager.startServer()
    }
    
    private var cancellables = Set<AnyCancellable>()
}

enum Tab: Hashable {
    case home
    case transfers
    case settings
}

struct Peer: Identifiable, Equatable {
    let id: UUID
    let name: String
    let platform: String
    var ip: String?
    var port: UInt16?
    var lastSeen: Date = Date()
}

struct TransferTask: Identifiable {
    let id: UUID
    let fileName: String
    let progress: Double
    let speed: String
    let isIncoming: Bool
}

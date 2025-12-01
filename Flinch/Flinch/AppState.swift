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

import Foundation
import Combine

class PairingManager: ObservableObject {
    @Published var pairingCode: String = ""
    @Published var isPairing: Bool = false
    @Published var isAuthenticated: Bool = false
    
    private var currentSessionToken: String?
    
    @Published var isInitiatingPairing: Bool = false
    @Published var inputCode: String = ""
    var targetPeer: Peer?
    
    func generateCode() {
        // Generate a random 4-digit code
        let code = String(format: "%04d", Int.random(in: 0...9999))
        self.pairingCode = code
        self.isPairing = true
        self.isInitiatingPairing = false
        self.isAuthenticated = false
        print("Generated Pairing Code: \(code)")
    }
    
    func initiatePairing(with peer: Peer) {
        self.targetPeer = peer
        self.isInitiatingPairing = true
        self.isPairing = false
        self.isAuthenticated = false
        self.inputCode = ""
    }
    
    func setRemotePeer(ip: String, port: UInt16) {
        // Create a temporary peer object for the remote device
        // We don't have the name yet, but we can update it later or use a placeholder
        self.targetPeer = Peer(id: UUID(), name: "Pairing Device", platform: "unknown", ip: ip, port: port)
        print("Set remote peer: \(ip):\(port)")
    }
    
    func verifyCode(_ code: String) -> Bool {
        if code == pairingCode {
            self.isAuthenticated = true
            self.isPairing = false
            self.currentSessionToken = UUID().uuidString
            return true
        }
        return false
    }
    
    func verifyRemoteCode(networkManager: NetworkManager, completion: @escaping (Bool) -> Void) {
        guard let peer = targetPeer, let ip = peer.ip, let port = peer.port else {
            completion(false)
            return
        }
        
        networkManager.sendPairingVerification(code: inputCode, to: ip, port: port) { success in
            DispatchQueue.main.async {
                if success {
                    self.isAuthenticated = true
                    self.isInitiatingPairing = false
                    self.currentSessionToken = UUID().uuidString
                }
                completion(success)
            }
        }
    }
    
    func reset() {
        self.pairingCode = ""
        self.isPairing = false
        self.isInitiatingPairing = false
        self.isAuthenticated = false
        self.currentSessionToken = nil
        self.targetPeer = nil
        self.inputCode = ""
    }
}

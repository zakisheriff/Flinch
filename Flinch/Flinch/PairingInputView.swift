import SwiftUI

struct PairingInputView: View {
    @EnvironmentObject var pairingManager: PairingManager
    @EnvironmentObject var appState: AppState
    @State private var isVerifying = false
    @State private var errorMessage: String?
    
    var body: some View {
        VStack(spacing: 30) {
            Text("Enter Pairing Code")
                .font(.largeTitle)
                .fontWeight(.bold)
            
            Text("Enter the 4-digit code displayed on the other device")
                .font(.title3)
                .foregroundColor(.secondary)
            
            TextField("0000", text: $pairingManager.inputCode)
                .font(.system(size: 60, weight: .heavy, design: .monospaced))
                .multilineTextAlignment(.center)
                .textFieldStyle(.plain)
                .frame(width: 200)
                .padding()
                .background(Color.white.opacity(0.1))
                .cornerRadius(20)
                .overlay(
                    RoundedRectangle(cornerRadius: 20)
                        .stroke(Color.blue.opacity(0.5), lineWidth: 2)
                )
                .onChange(of: pairingManager.inputCode) {
                    if pairingManager.inputCode.count > 4 {
                        pairingManager.inputCode = String(pairingManager.inputCode.prefix(4))
                    }
                }
            
            if let error = errorMessage {
                Text(error)
                    .foregroundColor(.red)
                    .font(.headline)
            }
            
            if isVerifying {
                ProgressView("Verifying...")
                    .progressViewStyle(CircularProgressViewStyle())
            } else {
                HStack(spacing: 20) {
                    Button("Cancel") {
                        pairingManager.reset()
                    }
                    .buttonStyle(.plain)
                    .padding()
                    
                    Button("Pair") {
                        verifyCode()
                    }
                    .buttonStyle(.borderedProminent)
                    .controlSize(.large)
                    .disabled(pairingManager.inputCode.count != 4)
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(VisualEffectBlur(material: .hudWindow, blendingMode: .behindWindow))
    }
    
    private func verifyCode() {
        isVerifying = true
        errorMessage = nil
        
        pairingManager.verifyRemoteCode(networkManager: appState.networkManager) { success in
            isVerifying = false
            if !success {
                errorMessage = "Incorrect code. Please try again."
            }
        }
    }
}

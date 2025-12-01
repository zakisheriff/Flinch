import SwiftUI

struct PairingView: View {
    @EnvironmentObject var pairingManager: PairingManager
    @EnvironmentObject var appState: AppState
    
    var body: some View {
        VStack(spacing: 30) {
            Text("Pairing Request")
                .font(.largeTitle)
                .fontWeight(.bold)
            
            Text("Enter this code on your other device")
                .font(.title3)
                .foregroundColor(.secondary)
            
            Text(pairingManager.pairingCode)
                .font(.system(size: 80, weight: .heavy, design: .monospaced))
                .kerning(10)
                .padding()
                .background(Color.white.opacity(0.1))
                .cornerRadius(20)
                .overlay(
                    RoundedRectangle(cornerRadius: 20)
                        .stroke(Color.blue.opacity(0.5), lineWidth: 2)
                )
            
            ProgressView("Waiting for connection...")
                .progressViewStyle(CircularProgressViewStyle())
                .scaleEffect(1.2)
            
            Button("Cancel") {
                pairingManager.reset()
            }
            .buttonStyle(.plain)
            .padding(.top, 20)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(VisualEffectBlur(material: .hudWindow, blendingMode: .behindWindow))
    }
}

import SwiftUI
import UniformTypeIdentifiers

struct SessionView: View {
    @EnvironmentObject var appState: AppState
    @EnvironmentObject var pairingManager: PairingManager
    
    var body: some View {
        VStack(spacing: 0) {
            // Header
            HStack {
                Text("Trusted Session")
                    .font(.headline)
                Spacer()
                
                Button(action: {
                    let panel = NSOpenPanel()
                    panel.allowsMultipleSelection = true
                    panel.canChooseDirectories = false
                    panel.canChooseFiles = true
                    
                    if panel.runModal() == .OK {
                        let urls = panel.urls
                        if let peer = pairingManager.targetPeer, let ip = peer.ip, let port = peer.port {
                             appState.networkManager.sendFiles(urls: urls, to: ip, port: port)
                        } else {
                            // Fallback if targetPeer is lost, maybe use last connected?
                            // For now, we assume targetPeer is set in PairingManager or we need to store it in AppState
                            // Actually, PairingManager has targetPeer but it's private.
                            // We should probably store the active session peer in AppState or pass it here.
                            // Let's assume we can get it from AppState if we track "currentSessionPeer"
                            // For now, let's try to find it from connectedPeers or just log error.
                            print("Error: No target peer for session")
                        }
                    }
                }) {
                    Label("Send Files", systemImage: "doc.badge.plus")
                }
                .buttonStyle(.borderedProminent)
                
                Button("End Session") {
                    pairingManager.reset()
                    appState.networkManager.cancelTransfer()
                }
                .buttonStyle(.bordered)
            }
            .padding()
            .background(VisualEffectBlur(material: .headerView, blendingMode: .withinWindow))
            
            Divider()
            
            // File History / Chat
            ScrollView {
                LazyVStack(spacing: 12) {
                    ForEach(appState.activeTransfers) { task in
                        TransferRow(task: task)
                    }
                }
                .padding()
            }
            
            Divider()
            
            // Drop Zone
            ZStack {
                Rectangle()
                    .fill(Color.blue.opacity(0.1))
                    .frame(height: 100)
                
                VStack {
                    Image(systemName: "arrow.up.doc")
                    .font(.largeTitle)
                    .foregroundColor(.blue)
                    Text("Drop files here to send instantly")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
            }
            .onDrop(of: [.fileURL], isTargeted: nil) { providers in
                loadFiles(from: providers) { urls in
                    if !urls.isEmpty {
                        // Same logic as button
                         if let peer = pairingManager.targetPeer, let ip = peer.ip, let port = peer.port {
                             appState.networkManager.sendFiles(urls: urls, to: ip, port: port)
                        } else {
                             print("Error: No target peer for session")
                        }
                    }
                }
                return true
            }
        }
        .background(Color(NSColor.windowBackgroundColor))
    }
    
    private func loadFiles(from providers: [NSItemProvider], completion: @escaping ([URL]) -> Void) {
        var urls: [URL] = []
        let group = DispatchGroup()
        
        for provider in providers {
            if provider.hasItemConformingToTypeIdentifier("public.file-url") {
                group.enter()
                provider.loadItem(forTypeIdentifier: "public.file-url", options: nil) { (item, error) in
                    if let data = item as? Data, let url = URL(dataRepresentation: data, relativeTo: nil) {
                        urls.append(url)
                    } else if let url = item as? URL {
                        urls.append(url)
                    }
                    group.leave()
                }
            }
        }
        
        group.notify(queue: .main) {
            completion(urls)
        }
    }
}

struct TransferRow: View {
    let task: TransferTask
    
    var body: some View {
        HStack {
            Image(systemName: task.isIncoming ? "arrow.down.circle.fill" : "arrow.up.circle.fill")
                .foregroundColor(task.isIncoming ? .green : .blue)
                .font(.title2)
            
            VStack(alignment: .leading) {
                Text(task.fileName)
                    .fontWeight(.medium)
                Text(task.isIncoming ? "Received" : "Sent")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
            
            Spacer()
            
            if task.progress < 100 {
                ProgressView(value: task.progress, total: 100)
                    .progressViewStyle(LinearProgressViewStyle())
                    .frame(width: 100)
            } else {
                Image(systemName: "checkmark.circle")
                    .foregroundColor(.secondary)
            }
        }
        .padding()
        .background(Color(NSColor.controlBackgroundColor))
        .cornerRadius(10)
    }
}

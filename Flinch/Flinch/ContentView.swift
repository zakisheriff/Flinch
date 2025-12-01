import SwiftUI

struct ContentView: View {
    @EnvironmentObject var appState: AppState
    
    var body: some View {
        NavigationView {
            Sidebar()
            HomeView()
        }
        .frame(minWidth: 800, minHeight: 600)
    }
}

struct Sidebar: View {
    @EnvironmentObject var appState: AppState
    
    var body: some View {
        List {
            NavigationLink(destination: HomeView(), tag: .home, selection: $appState.currentTab) {
                Label("Home", systemImage: "antenna.radiowaves.left.and.right")
            }
            NavigationLink(destination: TransfersView(), tag: .transfers, selection: $appState.currentTab) {
                Label("Transfers", systemImage: "arrow.up.arrow.down")
            }
            NavigationLink(destination: SettingsView(), tag: .settings, selection: $appState.currentTab) {
                Label("Settings", systemImage: "gear")
            }
        }
        .listStyle(SidebarListStyle())
        .navigationTitle("Flinch")
    }
}

struct HomeView: View {
    @EnvironmentObject var appState: AppState
    
    var body: some View {
        VStack {
            Text("Nearby Devices")
                .font(.title)
                .padding()
            
            Button("Force Scan") {
                appState.discoveryManager.startScanning()
            }
            .padding(.bottom)
            
            if appState.connectedPeers.isEmpty {
                VStack {
                    Image(systemName: "dot.radiowaves.left.and.right")
                        .font(.system(size: 50))
                        .foregroundColor(.gray)
                        .padding()
                    Text("Scanning for devices...")
                        .foregroundColor(.gray)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                List(appState.connectedPeers) { peer in
                    HStack(spacing: 16) {
                        Image(systemName: peer.platform == "macOS" ? "desktopcomputer" : "phone.fill")
                            .font(.system(size: 24))
                            .foregroundColor(.blue)
                            .frame(width: 40, height: 40)
                            .background(Color.blue.opacity(0.1))
                            .cornerRadius(8)
                        
                        VStack(alignment: .leading, spacing: 4) {
                            Text(peer.name)
                                .font(.system(size: 16, weight: .medium))
                                .foregroundColor(.primary)
                            Text(peer.platform)
                                .font(.system(size: 12))
                                .foregroundColor(.secondary)
                        }
                        
                        Spacer()
                        
                        Button(action: {
                            let panel = NSOpenPanel()
                            panel.allowsMultipleSelection = false
                            panel.canChooseDirectories = false
                            panel.canCreateDirectories = false
                            
                            if panel.runModal() == .OK {
                                if let url = panel.url {
                                    print("Selected file: \(url.path)")
                                    if let ip = peer.ip, let port = peer.port {
                                        appState.networkManager.sendFile(to: ip, port: port, url: url)
                                    } else {
                                        print("Peer IP/Port unknown")
                                    }
                                }
                            }
                        }) {
                            Text("Send File")
                                .fontWeight(.medium)
                                .padding(.horizontal, 12)
                                .padding(.vertical, 6)
                        }
                        .buttonStyle(.borderedProminent)
                    }
                    .padding(.vertical, 8)
                }
                .listStyle(.inset)
            }
            
            Spacer()
            
            HStack {
                Button(action: {
                    appState.isHosting.toggle()
                }) {
                    HStack {
                        Image(systemName: appState.isHosting ? "wifi.slash" : "wifi")
                        Text(appState.isHosting ? "Stop Hotspot" : "Start Hotspot")
                    }
                    .padding()
                    .background(appState.isHosting ? Color.red.opacity(0.2) : Color.blue.opacity(0.2))
                    .cornerRadius(10)
                }
            }
            .padding()
        }
        .background(VisualEffectView(material: .hudWindow, blendingMode: .behindWindow))
    }
}

struct TransfersView: View {
    var body: some View {
        Text("Transfers History")
    }
}

struct SettingsView: View {
    var body: some View {
        Text("Settings")
    }
}

struct VisualEffectView: NSViewRepresentable {
    let material: NSVisualEffectView.Material
    let blendingMode: NSVisualEffectView.BlendingMode
    
    func makeNSView(context: Context) -> NSVisualEffectView {
        let visualEffectView = NSVisualEffectView()
        visualEffectView.material = material
        visualEffectView.blendingMode = blendingMode
        visualEffectView.state = .active
        return visualEffectView
    }
    
    func updateNSView(_ visualEffectView: NSVisualEffectView, context: Context) {
        visualEffectView.material = material
        visualEffectView.blendingMode = blendingMode
    }
}

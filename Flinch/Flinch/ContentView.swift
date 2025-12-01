import SwiftUI

enum SidebarItem: Hashable, Identifiable, CaseIterable {
    case flinch
    case recents
    case settings
    
    var id: Self { self }
    
    var title: String {
        switch self {
        case .flinch: return "Flinch"
        case .recents: return "Recents"
        case .settings: return "Settings"
        }
    }
    
    var icon: String {
        switch self {
        case .flinch: return "antenna.radiowaves.left.and.right"
        case .recents: return "clock"
        case .settings: return "gear"
        }
    }
}

struct ContentView: View {
    @EnvironmentObject var appState: AppState
    @State private var selection: SidebarItem? = .flinch
    
    var body: some View {
        NavigationSplitView {
            List(SidebarItem.allCases, selection: $selection) { item in
                NavigationLink(value: item) {
                    Label(item.title, systemImage: item.icon)
                }
            }
            .navigationTitle("Flinch")
            .listStyle(.sidebar)
        } detail: {
            switch selection {
            case .flinch:
                FlinchHomeView()
            case .recents:
                RecentsView()
            case .settings:
                SettingsView()
            case .none:
                Text("Select an item")
            }
        }
        .frame(minWidth: 900, minHeight: 600)
        .alert("Receive File?", isPresented: Binding<Bool>(
            get: { appState.pendingRequest != nil },
            set: { _ in }
        )) {
            Button("Decline", role: .cancel) {
                appState.networkManager.resolveRequest(accept: false)
            }
            Button("Accept") {
                appState.networkManager.resolveRequest(accept: true)
            }
        } message: {
            if let request = appState.pendingRequest {
                Text("Do you want to receive '\(request.fileName)' (\(ByteCountFormatter.string(fromByteCount: request.fileSize, countStyle: .file)))?")
            }
        }
        .sheet(isPresented: $appState.isTransferring) {
            VStack(spacing: 20) {
                Image(systemName: "arrow.up.arrow.down.circle.fill")
                    .font(.system(size: 48))
                    .foregroundColor(.blue)
                
                VStack(spacing: 8) {
                    Text("Transferring File")
                        .font(.headline)
                    Text(appState.currentTransferFileName)
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                }
                
                ProgressView(value: appState.transferProgress, total: 100)
                    .frame(width: 200)
                
                Text("\(Int(appState.transferProgress))%")
                    .font(.caption)
                    .foregroundColor(.secondary)
                
                Button(role: .cancel) {
                    appState.networkManager.cancelTransfer()
                } label: {
                    Label("Cancel", systemImage: "xmark.circle")
                }
                .keyboardShortcut(.cancelAction)
            }
            .padding(40)
        }
    }
}

struct FlinchHomeView: View {
    @EnvironmentObject var appState: AppState
    
    var body: some View {
        VStack(spacing: 0) {
            // Toolbar-like header
            HStack {
                Text("Nearby Devices")
                    .font(.headline)
                    .foregroundColor(.secondary)
                
                Spacer()
                
                if appState.discoveryManager.isScanning {
                    ProgressView()
                        .controlSize(.small)
                        .padding(.trailing, 8)
                }
                
                Button(action: {
                    appState.discoveryManager.startScanning()
                }) {
                    Image(systemName: "arrow.clockwise")
                }
                .help("Rescan")
            }
            .padding()
            .background(Color(NSColor.controlBackgroundColor))
            
            Divider()
            
            if appState.connectedPeers.isEmpty {
                VStack(spacing: 20) {
                    Image(systemName: "wifi.exclamationmark")
                        .font(.system(size: 60))
                        .foregroundColor(.secondary.opacity(0.5))
                    Text("No devices found")
                        .font(.title2)
                        .foregroundColor(.secondary)
                    Text("Make sure Flinch is open on your other devices.")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(Color(NSColor.textBackgroundColor))
            } else {
                DeviceGridView(peers: appState.connectedPeers) { peer in
                    sendFile(to: peer)
                }
                .background(Color(NSColor.textBackgroundColor))
            }
        }
    }
    
    func sendFile(to peer: Peer) {
        let panel = NSOpenPanel()
        panel.allowsMultipleSelection = false
        panel.canChooseDirectories = false
        panel.canCreateDirectories = false
        
        panel.begin { response in
            if response == .OK, let url = panel.url {
                print("Selected file: \(url.path)")
                if let ip = peer.ip, let port = peer.port {
                    appState.networkManager.sendFile(to: ip, port: port, url: url)
                } else {
                    print("Peer IP/Port unknown")
                }
            }
        }
    }
}

struct RecentsView: View {
    @EnvironmentObject var appState: AppState
    
    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Text("Transfers")
                    .font(.headline)
                    .foregroundColor(.secondary)
                Spacer()
            }
            .padding()
            .background(Color(NSColor.controlBackgroundColor))
            
            Divider()
            
            if appState.activeTransfers.isEmpty {
                VStack(spacing: 10) {
                    Image(systemName: "clock")
                        .font(.system(size: 40))
                        .foregroundColor(.secondary.opacity(0.5))
                    Text("No Recent Transfers")
                        .font(.title3)
                        .foregroundColor(.secondary)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(Color(NSColor.textBackgroundColor))
            } else {
                List(appState.activeTransfers) { task in
                    HStack {
                        Image(systemName: task.isIncoming ? "arrow.down.circle.fill" : "arrow.up.circle.fill")
                            .foregroundColor(task.isIncoming ? .green : .blue)
                            .font(.title2)
                        
                        VStack(alignment: .leading) {
                            Text(task.fileName)
                                .font(.headline)
                            Text(task.speed)
                                .font(.caption)
                                .foregroundColor(.secondary)
                        }
                        
                        Spacer()
                        
                        ProgressView(value: task.progress)
                            .progressViewStyle(.linear)
                            .frame(width: 100)
                    }
                    .padding(.vertical, 4)
                }
                .listStyle(.inset)
                .background(Color(NSColor.textBackgroundColor))
            }
        }
    }
}

struct SettingsView: View {
    @EnvironmentObject var appState: AppState
    
    @State private var isAndroidExpanded = false
    @State private var isMacExpanded = false
    @State private var isTroubleshootingExpanded = false
    
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                GroupBox(label: Label("General", systemImage: "gear")) {
                    VStack(alignment: .leading, spacing: 10) {
                        Toggle("Start Hotspot", isOn: $appState.isHosting)
                            .toggleStyle(.switch)
                            .help("Creates a temporary Wi-Fi hotspot for faster transfers")
                        
                        if appState.isHosting {
                            Text("Note: On macOS 11+, you may need to manually create a network named 'Flinch-Hotspot' in System Settings > Wi-Fi if this fails.")
                                .font(.caption)
                                .foregroundColor(.secondary)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                    .padding(10)
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                
                GroupBox(label: Label("How to Use", systemImage: "book")) {
                    VStack(alignment: .leading, spacing: 12) {
                        DisclosureGroup(isExpanded: $isAndroidExpanded) {
                            VStack(alignment: .leading, spacing: 8) {
                                Label("1. Enable Wi-Fi & Bluetooth", systemImage: "wifi")
                                Label("2. Turn ON Location Services", systemImage: "location.fill")
                                    .foregroundColor(.red)
                                Text("   (Required for device discovery)")
                                    .font(.caption)
                                    .foregroundColor(.secondary)
                                Label("3. Grant Permissions", systemImage: "hand.raised.fill")
                                Label("4. Keep App Open", systemImage: "iphone")
                            }
                            .padding(.leading)
                            .padding(.vertical, 4)
                        } label: {
                            Text("Android Setup")
                                .font(.headline)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .contentShape(Rectangle())
                                .onTapGesture {
                                    withAnimation {
                                        isAndroidExpanded.toggle()
                                    }
                                }
                        }
                        
                        Divider()
                        
                        DisclosureGroup(isExpanded: $isMacExpanded) {
                            VStack(alignment: .leading, spacing: 8) {
                                Label("1. Enable Wi-Fi & Bluetooth", systemImage: "wifi")
                                Label("2. App Advertises Automatically", systemImage: "antenna.radiowaves.left.and.right")
                                Label("3. Select Device to Send", systemImage: "arrow.up.circle")
                            }
                            .padding(.leading)
                            .padding(.vertical, 4)
                        } label: {
                            Text("Mac Setup")
                                .font(.headline)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .contentShape(Rectangle())
                                .onTapGesture {
                                    withAnimation {
                                        isMacExpanded.toggle()
                                    }
                                }
                        }
                        
                        Divider()
                        
                        DisclosureGroup(isExpanded: $isTroubleshootingExpanded) {
                            VStack(alignment: .leading, spacing: 8) {
                                Text("• Devices not appearing? Toggle Wi-Fi off/on.")
                                Text("• Android not seeing Mac? Tap 'Rescan' and check Location.")
                                Text("• Ensure both devices are on the same network.")
                            }
                            .padding(.leading)
                            .padding(.vertical, 4)
                            .foregroundColor(.secondary)
                        } label: {
                            Text("Troubleshooting")
                                .font(.headline)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .contentShape(Rectangle())
                                .onTapGesture {
                                    withAnimation {
                                        isTroubleshootingExpanded.toggle()
                                    }
                                }
                        }
                    }
                    .padding(10)
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                
                GroupBox(label: Label("About", systemImage: "info.circle")) {
                    VStack(spacing: 8) {
                        HStack {
                            Text("Version")
                            Spacer()
                            Text("1.0.0 (Production)")
                                .foregroundColor(.secondary)
                        }
                        Divider()
                        HStack {
                            Text("Developer")
                            Spacer()
                            Text("The One Atom")
                                .foregroundColor(.secondary)
                        }
                    }
                    .padding(10)
                }
            }
            .padding()
            .frame(maxWidth: 600)
        }
    }
}


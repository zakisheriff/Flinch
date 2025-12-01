import SwiftUI
import UniformTypeIdentifiers

struct DeviceGridView: View {
    let peers: [Peer]
    let onSend: (Peer) -> Void
    let onDropFiles: ((Peer, [URL]) -> Void)?
    
    let columns = [
        GridItem(.adaptive(minimum: 120, maximum: 160), spacing: 20)
    ]
    
    var body: some View {
        ScrollView {
            LazyVGrid(columns: columns, spacing: 30) {
                ForEach(peers) { peer in
                    DeviceIconView(peer: peer)
                        .onTapGesture {
                            onSend(peer)
                        }
                        .onDrop(of: [.fileURL], isTargeted: nil) { providers in
                            loadFiles(from: providers) { urls in
                                if !urls.isEmpty {
                                    onDropFiles?(peer, urls)
                                }
                            }
                            return true
                        }
                }
            }
            .padding(30)
        }
        .background(Color(NSColor.controlBackgroundColor))
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

struct DeviceIconView: View {
    let peer: Peer
    @State private var isHovering = false
    
    var body: some View {
        VStack(spacing: 8) {
            ZStack {
                RoundedRectangle(cornerRadius: 12)
                    .fill(isHovering ? Color.accentColor.opacity(0.1) : Color.clear)
                    .frame(width: 80, height: 80)
                
                Image(systemName: iconName(for: peer.platform))
                    .font(.system(size: 48))
                    .foregroundColor(isHovering ? .accentColor : .secondary)
            }
            
            VStack(spacing: 2) {
                Text(peer.name)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundColor(.primary)
                    .lineLimit(1)
                    .truncationMode(.tail)
                
                Text(peer.platform)
                    .font(.system(size: 11))
                    .foregroundColor(.secondary)
            }
        }
        .padding(10)
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(isHovering ? Color(NSColor.controlBackgroundColor).opacity(0.5) : Color.clear)
        )
        .onHover { hover in
            withAnimation(.easeInOut(duration: 0.1)) {
                isHovering = hover
            }
        }
    }
    
    func iconName(for platform: String) -> String {
        switch platform.lowercased() {
        case "macos": return "desktopcomputer"
        case "ios": return "iphone"
        case "android": return "phone.fill" // Or a more generic phone icon
        default: return "questionmark.square.dashed"
        }
    }
}

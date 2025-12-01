import SwiftUI
import UniformTypeIdentifiers

struct DeviceTransferView: View {
    let peer: Peer
    @EnvironmentObject var appState: AppState
    @State private var selectedFiles: [URL] = []
    @Binding var isPresented: Bool // To go back

    var body: some View {
        VStack(spacing: 0) {
            // Header
            HStack {
                Button(action: { isPresented = false }) {
                    HStack(spacing: 4) {
                        Image(systemName: "chevron.left")
                        Text("Back")
                    }
                }
                .buttonStyle(.borderless)
                
                Spacer()
                
                Text("Send to \(peer.name)")
                    .font(.headline)
                
                Spacer()
                
                // Invisible spacer to balance the back button
                Text("Back").hidden()
            }
            .padding()
            .background(Color(NSColor.controlBackgroundColor))
            
            Divider()

            // File List / Drop Zone
            VStack {
                if selectedFiles.isEmpty {
                    VStack(spacing: 20) {
                        Image(systemName: "arrow.down.doc.fill")
                            .font(.system(size: 48))
                            .foregroundColor(.secondary.opacity(0.5))
                        
                        Text("Drag and drop files here")
                            .font(.title3)
                            .foregroundColor(.secondary)
                        
                        Button("Choose Files...") {
                            openFilePicker()
                        }
                        .controlSize(.large)
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    List {
                        ForEach(selectedFiles, id: \.self) { url in
                            HStack {
                                Image(systemName: "doc.fill")
                                    .foregroundColor(.blue)
                                Text(url.lastPathComponent)
                                    .lineLimit(1)
                                    .truncationMode(.middle)
                                Spacer()
                                Button(action: {
                                    if let index = selectedFiles.firstIndex(of: url) {
                                        selectedFiles.remove(at: index)
                                    }
                                }) {
                                    Image(systemName: "xmark.circle.fill")
                                        .foregroundColor(.secondary)
                                }
                                .buttonStyle(.plain)
                            }
                            .padding(.vertical, 4)
                        }
                    }
                    .listStyle(.inset)
                }
            }
            .background(Color(NSColor.textBackgroundColor))
            .onDrop(of: [.fileURL], isTargeted: nil) { providers in
                loadFiles(from: providers)
                return true
            }

            Divider()

            // Footer
            HStack {
                Text("\(selectedFiles.count) files selected")
                    .foregroundColor(.secondary)
                
                Spacer()
                
                Button("Add More") {
                    openFilePicker()
                }
                
                Button("Send All") {
                    sendFiles()
                }
                .buttonStyle(.borderedProminent)
                .disabled(selectedFiles.isEmpty)
            }
            .padding()
            .background(Color(NSColor.controlBackgroundColor))
        }
    }

    func openFilePicker() {
        let panel = NSOpenPanel()
        panel.allowsMultipleSelection = true
        panel.canChooseDirectories = false
        panel.begin { response in
            if response == .OK {
                // Filter out duplicates
                let newUrls = panel.urls.filter { url in
                    !self.selectedFiles.contains(url)
                }
                self.selectedFiles.append(contentsOf: newUrls)
            }
        }
    }

    func sendFiles() {
        if let ip = peer.ip, let port = peer.port {
            appState.networkManager.sendFiles(urls: selectedFiles, to: ip, port: port)
            // We can choose to stay or go back. 
            // Going back feels right as the global progress modal will appear.
            isPresented = false 
        }
    }
    
    private func loadFiles(from providers: [NSItemProvider]) {
        let group = DispatchGroup()
        var newUrls: [URL] = []
        
        for provider in providers {
            if provider.hasItemConformingToTypeIdentifier("public.file-url") {
                group.enter()
                provider.loadItem(forTypeIdentifier: "public.file-url", options: nil) { (item, error) in
                    if let data = item as? Data, let url = URL(dataRepresentation: data, relativeTo: nil) {
                        newUrls.append(url)
                    } else if let url = item as? URL {
                        newUrls.append(url)
                    }
                    group.leave()
                }
            }
        }
        
        group.notify(queue: .main) {
            // Filter duplicates
            let uniqueUrls = newUrls.filter { url in
                !self.selectedFiles.contains(url)
            }
            self.selectedFiles.append(contentsOf: uniqueUrls)
        }
    }
}

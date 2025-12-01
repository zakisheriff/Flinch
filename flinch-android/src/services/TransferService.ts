import { NativeModules } from 'react-native';

const { FlinchNetwork } = NativeModules;

interface FlinchNetworkInterface {
    connectToHost(ip: string, port: number): Promise<string>;
    sendFileUDP(ip: string, port: number, filePath: string): Promise<string>;
    sendFileTCP(ip: string, port: number, filePath: string): Promise<string>;
    startBleAdvertising(uuid: string, name: string): Promise<string>;
    startBleAdvertisingWithPayload(uuid: string, ip: string, port: number): Promise<string>;
    stopBleAdvertising(): Promise<string>;
    startServer(): Promise<string>;
    resolveTransferRequestWithMetadata(requestId: String, accept: boolean, fileName: string, fileSizeStr: string): Promise<void>;
    cancelTransfer(): Promise<string>;
    openFile(filePath: string): Promise<void>;
}

export const TransferService = {
    connect: async (ip: string, port: number): Promise<boolean> => {
        try {
            const result = await (FlinchNetwork as FlinchNetworkInterface).connectToHost(ip, port);
            return result === "Connected";
        } catch (error) {
            console.error("Connection failed", error);
            return false;
        }
    },

    sendFile: async (ip: string, port: number, filePath: string): Promise<"SUCCESS" | "FAILED" | "CANCELLED"> => {
        try {
            // Use TCP for reliability with Mac Server
            const result = await (FlinchNetwork as FlinchNetworkInterface).sendFileTCP(ip, port, filePath);
            return result === "Sent" ? "SUCCESS" : "FAILED";
        } catch (error: any) {
            if (error?.code === "CANCELLED" || error?.message?.includes("cancelled")) {
                console.log("Transfer cancelled by user");
                return "CANCELLED";
            }
            if (error?.message?.includes("rejected") || error?.message?.includes("declined")) {
                console.log("Transfer rejected by receiver");
                return "DECLINED";
            }
            console.error("Send failed", error);
            return "FAILED";
        }
    },

    cancelTransfer: async (): Promise<boolean> => {
        try {
            const result = await (FlinchNetwork as FlinchNetworkInterface).cancelTransfer();
            console.log("Transfer cancelled:", result);
            return true;
        } catch (error) {
            console.error("Cancel failed:", error);
            return false;
        }
    },

    startAdvertising: async (uuid: string, name: string): Promise<boolean> => {
        try {
            const result = await (FlinchNetwork as FlinchNetworkInterface).startBleAdvertising(uuid, name);
            console.log("Advertising started:", result);
            return true;
        } catch (error) {
            console.error("Advertising failed:", error);
            return false;
        }
    },

    stopAdvertising: async (): Promise<boolean> => {
        try {
            const result = await (FlinchNetwork as FlinchNetworkInterface).stopBleAdvertising();
            console.log("Advertising stopped:", result);
            return true;
        } catch (error) {
            console.error("Stop advertising failed:", error);
            return false;
        }
    },

    startServer: async (): Promise<string> => {
        try {
            const result = await (FlinchNetwork as FlinchNetworkInterface).startServer();
            return result;
        } catch (error) {
            console.error("Start server failed:", error);
            throw error;
        }
    },

    initiatePairing: async (ip: string, port: number): Promise<boolean> => {
        try {
            const result = await (FlinchNetwork as FlinchNetworkInterface).sendPairingInitiation(ip, port);
            return result === "INITIATED";
        } catch (error) {
            console.error("Pairing initiation failed:", error);
            return false;
        }
    },

    resolvePairingRequest: async (requestId: string, success: boolean): Promise<void> => {
        try {
            await (FlinchNetwork as FlinchNetworkInterface).resolvePairingRequest(requestId, success);
        } catch (error) {
            console.error("Resolve pairing request failed:", error);
            throw error;
        }
    },

    startBleAdvertisingWithPayload: async (uuid: string, ip: string, port: number): Promise<boolean> => {
        try {
            // Check if method exists on native module (it might not if not rebuilt)
            if (!(FlinchNetwork as any).startBleAdvertisingWithPayload) {
                console.error("startBleAdvertisingWithPayload not found on native module");
                return false;
            }
            const result = await (FlinchNetwork as any).startBleAdvertisingWithPayload(uuid, ip, port);
            console.log("Advertising with payload started:", result);
            return true;
        } catch (error) {
            console.error("Advertising with payload failed:", error);
            return false;
        }
    },

    resolveTransferRequest: async (requestId: string, accept: boolean, fileName: string, fileSizeStr: string): Promise<boolean> => {
        try {
            await (FlinchNetwork as FlinchNetworkInterface).resolveTransferRequestWithMetadata(requestId, accept, fileName, fileSizeStr);
            return true;
        } catch (error) {
            console.error("Resolve request failed:", error);
            return false;
        }
    },

    openFile: async (filePath: string): Promise<void> => {
        try {
            await (FlinchNetwork as FlinchNetworkInterface).openFile(filePath);
        } catch (error) {
            console.error("Open file failed:", error);
            throw error;
        }
    },

    sendPairingRequest: async (ip: string, port: number, code: string): Promise<boolean> => {
        try {
            // We need a way to send a string message over TCP.
            // FlinchNetworkModule might need a 'sendMessage' method or we use 'sendFileTCP' with a dummy file?
            // Or better, add 'sendPairingRequest' to native module.
            // For now, let's assume we can use a raw socket or add the method.
            // Since I can't easily add native methods without rebuild, 
            // I'll try to use the existing 'connectToHost' which establishes a socket, 
            // but 'connectToHost' just checks connection.

            // I need to add 'sendPairingRequest' to FlinchNetworkModule.kt first.
            // But I want to avoid native changes if possible to save time?
            // No, I must add it for it to work.

            // Wait, I can use 'sendFileTCP' but that sends a file.
            // I'll add 'sendPairingRequest' to FlinchNetworkModule.kt.

            // For now, I'll define the interface here.
            const result = await (FlinchNetwork as any).sendPairingRequest(ip, port, code);
            return result === "PAIRED";
        } catch (error) {
            console.error("Pairing failed:", error);
            return false;
        }
    },

    initiatePairing: async (ip: string, port: number): Promise<boolean> => {
        try {
            // Sends PAIR_REQUEST to trigger code generation on the other device
            const result = await (FlinchNetwork as any).sendPairingInitiation(ip, port);
            return result === "INITIATED";
        } catch (error) {
            console.error("Pairing initiation failed:", error);
            return false;
        }
    }
};

import { BleManager } from 'react-native-ble-plx';
import { NativeModules } from 'react-native';

const { FlinchNetwork } = NativeModules;

class BleServiceInstance {
    manager: BleManager;

    constructor() {
        this.manager = new BleManager();
    }

    getManager() {
        return this.manager;
    }

    async startAdvertising(uuid: string, name: string): Promise<void> {
        try {
            const serverInfo = await FlinchNetwork.getServerInfo();
            const { ip, port } = serverInfo;
            console.log(`Starting BLE Advertising with IP: ${ip}, Port: ${port}`);
            return FlinchNetwork.startBleAdvertisingWithPayload(uuid, ip, port);
        } catch (error) {
            console.log("Failed to get server info for advertising, trying fallback or failing:", error);
            // If server not started, maybe we should start it?
            // But usually server is started by HomeScreen.
            // If we are in RecentScreen, we assume connection exists, so server might be running?
            // Or maybe we are the client?
            // If we are the client (Android connected to Mac), we might not have a server running?
            // Wait, if Android connects to Mac, Android is the client.
            // But for Mac to discover Android, Android must advertise.
            // And Mac needs to connect to Android to pull files?
            // Or does Android push files?
            // Android pushes files.
            // So why does Mac need to discover Android?
            // "mac doesnt shows the android phone in discovery"
            // This implies the user wants to initiate transfer FROM Mac TO Android?
            // OR the user just wants to see the device.

            // If Mac wants to send files to Android, Android must be a server.
            // So Android MUST start a server.

            // If `getServerInfo` fails, it means server is not running.
            // We should start it.
            try {
                const address = await FlinchNetwork.startServer();
                console.log("Server started at:", address);
                // address is "IP:Port"
                const parts = address.split(":");
                const ip = parts[0];
                const port = parseInt(parts[1]);
                return FlinchNetwork.startBleAdvertisingWithPayload(uuid, ip, port);
            } catch (err) {
                console.error("Failed to start server and advertise:", err);
                throw err;
            }
        }
    }

    async stopAdvertising(): Promise<void> {
        return FlinchNetwork.stopBleAdvertising();
    }
}

export const BleService = new BleServiceInstance();

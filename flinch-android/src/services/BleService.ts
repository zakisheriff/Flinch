import { BleManager } from 'react-native-ble-plx';

class BleServiceInstance {
    manager: BleManager;

    constructor() {
        this.manager = new BleManager();
    }

    getManager() {
        return this.manager;
    }
}

export const BleService = new BleServiceInstance();

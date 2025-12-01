import { Stack } from 'expo-router';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from 'expo-router';

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    // Load fonts here if needed
  });

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return <RootLayoutNav />;
}

import { NativeEventEmitter, NativeModules, Alert, DeviceEventEmitter } from 'react-native';
import { TransferService } from '../src/services/TransferService';
import PairingModal from '../src/components/PairingModal';
import AlertModal from '../src/components/AlertModal';
import TransferProgressModal from '../src/components/TransferProgressModal';
import { useState, useRef } from 'react';
import { useRouter } from 'expo-router';

function RootLayoutNav() {
  const router = useRouter();
  const [transferState, setTransferState] = useState<{
    visible: boolean;
    progress: number;
    fileName: string;
    type: 'sending' | 'receiving';
  }>({
    visible: false,
    progress: 0,
    fileName: '',
    type: 'receiving'
  });

  const [pairingVisible, setPairingVisible] = useState(false);
  const [pairingRequest, setPairingRequest] = useState<{ requestId: string, remotePort: number } | null>(null);

  // Alert State
  const [alertConfig, setAlertConfig] = useState<{
    visible: boolean;
    title: string;
    message: string;
    type: 'success' | 'error' | 'info';
  }>({
    visible: false,
    title: '',
    message: '',
    type: 'info'
  });

  const showAlert = (title: string, message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setAlertConfig({ visible: true, title, message, type });
  };

  useEffect(() => {
    const eventEmitter = new NativeEventEmitter(NativeModules.FlinchNetwork);

    const pairingRequestSub = eventEmitter.addListener('Flinch:PairingRequest', (event: any) => {
      console.log("Received Pairing Request:", event);
      setPairingRequest({ requestId: event.requestId, remotePort: event.remotePort });
      setPairingVisible(true);
    });

    const transferRequestSub = eventEmitter.addListener('Flinch:TransferRequest', (event: any) => {
      console.log("Received Transfer Request:", event);
      // Auto-accept incoming transfers
      TransferService.resolveTransferRequest(event.requestId, true, event.fileName, event.fileSize);

      setTransferState({
        visible: true,
        progress: 0,
        fileName: event.fileName,
        type: 'receiving'
      });
    });

    const transferProgressSub = eventEmitter.addListener('Flinch:TransferProgress', (event: any) => {
      setTransferState(prev => ({
        ...prev,
        visible: true,
        progress: event.progress,
        fileName: event.fileName,
        type: 'receiving'
      }));
    });

    const transferCancelledSub = eventEmitter.addListener('Flinch:TransferCancelled', () => {
      setTransferState(prev => ({ ...prev, visible: false }));
    });

    const fileReceivedSub = eventEmitter.addListener('Flinch:FileReceived', (event: any) => {
      setTransferState(prev => ({ ...prev, visible: false }));
      showAlert("File Received", `Saved to Downloads: ${event.fileName}`, "success");
    });

    const fileErrorSub = eventEmitter.addListener('Flinch:FileError', (event: any) => {
      setTransferState(prev => ({ ...prev, visible: false }));
      showAlert("Transfer Error", event.message || "Unknown error", "error");
    });

    return () => {
      pairingRequestSub.remove();
      transferRequestSub.remove();
      transferProgressSub.remove();
      transferCancelledSub.remove();
      fileReceivedSub.remove();
      fileErrorSub.remove();
    };
  }, []);

  return (
    <>
      <Stack>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="recent" options={{ headerShown: false }} />
      </Stack>

      {pairingVisible && pairingRequest && (
        <PairingModalController
          visible={pairingVisible}
          requestId={pairingRequest.requestId}
          remotePort={pairingRequest.remotePort}
          onClose={() => {
            setPairingVisible(false);
            setPairingRequest(null);
          }}
          onSuccess={(deviceName, ip, port) => {
            setPairingVisible(false);
            setPairingRequest(null);
            router.push({
              pathname: "/recent",
              params: { deviceName, ip, port }
            });
          }}
          showAlert={showAlert}
        />
      )}

      <TransferProgressModal
        visible={transferState.visible}
        progress={transferState.progress}
        fileName={transferState.fileName}
        isReceiving={transferState.type === 'receiving'}
        onCancel={() => {
          setTransferState(prev => ({ ...prev, visible: false }));
        }}
      />

      <AlertModal
        visible={alertConfig.visible}
        title={alertConfig.title}
        message={alertConfig.message}
        type={alertConfig.type}
        onClose={() => setAlertConfig(prev => ({ ...prev, visible: false }))}
      />
    </>
  );
}

// Wrapper to handle logic
interface PairingModalControllerProps {
  visible: boolean;
  requestId: string;
  remotePort: number;
  onClose: () => void;
  onSuccess: (deviceName: string, ip: string, port: number) => void;
  showAlert: (title: string, message: string, type: 'success' | 'error' | 'info') => void;
}

function PairingModalController({ visible, requestId, remotePort, onClose, onSuccess, showAlert }: PairingModalControllerProps) {
  const [code, setCode] = useState("");

  useEffect(() => {
    // Generate code on mount
    const newCode = Math.floor(1000 + Math.random() * 9000).toString();
    setCode(newCode);

    const eventEmitter = new NativeEventEmitter(NativeModules.FlinchNetwork);
    const sub = eventEmitter.addListener('Flinch:PairingVerify', (data: any) => {
      console.log("Verifying code:", data.code, "Expected:", newCode);
      if (data.code === newCode) {
        // Success!
        TransferService.resolvePairingRequest(data.requestId, true);
        onSuccess("Mac", data.remoteIp, data.remotePort || remotePort);
      } else {
        // Fail
        TransferService.resolvePairingRequest(data.requestId, false);
        showAlert("Pairing Failed", "Incorrect code entered on Mac.", "error");
        onClose();
      }
    });

    // Assuming the user wants to modify a cleanup function that is not fully present in the provided code,
    // based on the instruction to remove 'transferCancelledSub.remove()'.
    // This block is a placeholder for where such a cleanup might exist.
    // If this useEffect is not the intended target, please provide more context.
    return () => {
      sub.remove();
      // If other subscriptions like transferRequestSub, transferProgressSub, pairingRequestSub,
      // and transferCancelledSub were defined here, their cleanup would be handled.
      // For example, if they existed:
      // transferRequestSub?.remove();
      // transferProgressSub?.remove();
      // pairingRequestSub?.remove();
      // transferCancelledSub?.remove(); // This line would be removed if it existed.
    };
  }, []);

  return (
    <PairingModal
      visible={visible}
      requestId={requestId}
      remotePort={remotePort}
      code={code}
      onClose={() => {
        TransferService.resolvePairingRequest(requestId, false);
        onClose();
      }}
    />
  );
}

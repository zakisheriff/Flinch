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
import { useState, useRef } from 'react';
import { useRouter } from 'expo-router';

function RootLayoutNav() {
  const router = useRouter();
  const [pairingVisible, setPairingVisible] = useState(false);
  const [pairingRequest, setPairingRequest] = useState<{ requestId: string, remotePort: number } | null>(null);
  const generatedCodeRef = useRef<string>("");

  useEffect(() => {
    const eventEmitter = new NativeEventEmitter(NativeModules.FlinchNetwork);

    const transferRequestSub = eventEmitter.addListener('Flinch:TransferRequest', (data: any) => {
      console.log("Transfer Request:", data);
      Alert.alert(
        "Incoming File",
        `Receive ${data.fileName} (${(parseInt(data.fileSize) / 1024 / 1024).toFixed(2)} MB)?`,
        [
          {
            text: "Reject",
            style: "cancel",
            onPress: () => TransferService.resolveTransferRequest(data.requestId, false, data.fileName, data.fileSize)
          },
          {
            text: "Accept",
            onPress: () => TransferService.resolveTransferRequest(data.requestId, true, data.fileName, data.fileSize)
          }
        ]
      );
    });

    const pairingRequestSub = eventEmitter.addListener('Flinch:PairingRequest', (data: any) => {
      console.log("Pairing Request:", data);
      // Show Modal instead of Alert
      setPairingRequest({
        requestId: data.requestId,
        remotePort: data.remotePort
      });
      setPairingVisible(true);
    });

    return () => {
      transferRequestSub.remove();
      pairingRequestSub.remove();
    };
  }, []);

  // We need to handle the verification logic here because the listener is here.
  // Let's refactor slightly to generate code here.

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
        />
      )}
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
}

function PairingModalController({ visible, requestId, remotePort, onClose, onSuccess }: PairingModalControllerProps) {
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
        // Use the requestId from the VERIFY event, not the initial request
        TransferService.resolvePairingRequest(data.requestId, true);
        onSuccess("Mac", data.remoteIp, data.remotePort || remotePort);
      } else {
        // Fail
        TransferService.resolvePairingRequest(data.requestId, false);
        Alert.alert("Pairing Failed", "Incorrect code");
        onClose();
      }
    });

    return () => {
      sub.remove();
    };
  }, []);

  return (
    <PairingModal
      visible={visible}
      requestId={requestId}
      remotePort={remotePort}
      code={code} // Pass the generated code
      onClose={() => {
        TransferService.resolvePairingRequest(requestId, false);
        onClose();
      }}
    // Pass code to display
    // We need to update PairingModal to accept 'code' prop instead of generating it
    />
  );
}

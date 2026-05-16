import { MaterialCommunityIcons } from "@expo/vector-icons";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { RootStackParamList } from "../navigation/types";
import { palette } from "../theme";

type Props = NativeStackScreenProps<RootStackParamList, "ScanCamera">;

// Keep original green colors for CameraScreen, except text
const cameraGreen = {
  primary: "#3E6F52",
  primaryDark: "#2F5A42",
};

export function CameraScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [torchEnabled, setTorchEnabled] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const cameraRef = useRef<CameraView | null>(null);

  React.useEffect(() => {
    navigation.setOptions({
      headerLeft: () => (
        <Pressable onPress={() => navigation.goBack()} style={{ marginLeft: 8 }}>
          <MaterialCommunityIcons
            name="chevron-left"
            size={28}
            color={palette.text}
          />
        </Pressable>
      ),
    });
  }, [navigation]);

  const takePhoto = async () => {
    if (!cameraRef.current || capturing) {
      return;
    }

    try {
      setCapturing(true);
      const photo = await cameraRef.current.takePictureAsync({
        quality: 1,
        shutterSound: false,
      });

      if (!photo?.uri) {
        throw new Error("Unable to capture image.");
      }

      navigation.replace("CropImage", {
        imageUri: photo.uri,
        source: "camera",
      });
    } catch (error) {
      Alert.alert("Capture failed", "Please try taking the photo again.");
    } finally {
      setCapturing(false);
    }
  };

  if (!permission) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={cameraGreen.primary} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top }]}>
        <Text style={styles.permissionTitle}>Camera access is required</Text>
        <Text style={styles.permissionText}>
          Allow camera access to scan cinnamon stems.
        </Text>
        <Pressable style={styles.permissionButton} onPress={requestPermission}>
          <Text style={styles.permissionButtonText}>Allow Camera Access</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.cameraContainer}>
        <CameraView
          ref={cameraRef}
          style={styles.camera}
          facing="back"
          enableTorch={torchEnabled}
          autofocus="on"
        />
        <View style={styles.overlay} pointerEvents="none">
          <View style={styles.frame} />
          <Text style={styles.overlayHint}>
            Keep the stem centered with good light and 10-15 cm distance.
          </Text>
        </View>
      </View>

      <View style={[styles.controls, { paddingBottom: insets.bottom }]}>
        <Pressable
          style={styles.smallAction}
          onPress={() => setTorchEnabled((prev) => !prev)}
        >
          <MaterialCommunityIcons
            name={torchEnabled ? "flashlight-off" : "flashlight"}
            size={18}
            color={palette.primaryDark}
          />
          <Text style={styles.smallActionText}>
            {torchEnabled ? "Torch Off" : "Torch On"}
          </Text>
        </Pressable>

        <Pressable
          style={[styles.captureButton, capturing && styles.captureDisabled]}
          onPress={takePhoto}
          disabled={capturing}
        >
          <Text style={styles.captureText}>
            {capturing ? "Capturing..." : "Take Photo"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#0f1713",
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.background,
    paddingHorizontal: 24,
    gap: 10,
  },
  permissionTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: palette.text,
    textAlign: "center",
  },
  permissionText: {
    color: palette.textMuted,
    textAlign: "center",
    lineHeight: 20,
  },
  permissionButton: {
    marginTop: 8,
    backgroundColor: cameraGreen.primary,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  permissionButtonText: {
    color: palette.surface,
    fontWeight: "700",
  },
  cameraContainer: {
    flex: 1,
    margin: 12,
    borderRadius: 18,
    overflow: "hidden",
  },
  camera: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 18,
    zIndex: 10,
  },
  frame: {
    width: "76%",
    aspectRatio: 1.4,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.9)",
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  overlayHint: {
    marginTop: 14,
    color: "#ECF5EE",
    textAlign: "center",
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "500",
  },
  controls: {
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 10,
  },
  smallAction: {
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: palette.surface,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  smallActionText: {
    color: palette.primaryDark,
    fontWeight: "700",
    fontSize: 13,
  },
  captureButton: {
    backgroundColor: cameraGreen.primary,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  captureDisabled: {
    opacity: 0.65,
  },
  captureText: {
    color: palette.surface,
    fontSize: 16,
    fontWeight: "800",
  },
});

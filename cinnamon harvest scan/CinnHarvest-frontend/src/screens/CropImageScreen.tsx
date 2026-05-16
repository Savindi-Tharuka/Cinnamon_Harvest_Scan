import { NativeStackScreenProps } from "@react-navigation/native-stack";
import * as ImageManipulator from "expo-image-manipulator";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { RootStackParamList } from "../navigation/types";
import { palette } from "../theme";

type Props = NativeStackScreenProps<RootStackParamList, "CropImage">;
type Point = { x: number; y: number };

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function CropImageScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { imageUri, source } = route.params;
  const screenWidth = Dimensions.get("window").width;
  const frameWidth = Math.min(screenWidth - 36, 360);
  const frameHeight = frameWidth / 1.4;

  const [imageSize, setImageSize] = useState({ width: 1, height: 1 });
  const [loadingImage, setLoadingImage] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 });

  const gestureMode = useRef<"none" | "pan" | "pinch">("none");
  const panStartTouch = useRef<Point>({ x: 0, y: 0 });
  const panStartOffset = useRef<Point>({ x: 0, y: 0 });
  const pinchStartDistance = useRef(1);
  const pinchStartScale = useRef(1);
  const pinchStartCenter = useRef<Point>({ x: 0, y: 0 });
  const pinchStartOffset = useRef<Point>({ x: 0, y: 0 });

  const imageAspect = imageSize.width / imageSize.height;
  const frameAspect = frameWidth / frameHeight;

  const baseSize = useMemo(() => {
    if (imageAspect >= frameAspect) {
      const height = frameHeight;
      const width = height * imageAspect;
      return { width, height };
    }
    const width = frameWidth;
    const height = width / imageAspect;
    return { width, height };
  }, [frameHeight, frameWidth, imageAspect, frameAspect]);

  const clampOffset = (next: Point, nextScale: number): Point => {
    const scaledWidth = baseSize.width * nextScale;
    const scaledHeight = baseSize.height * nextScale;
    const maxX = Math.max((scaledWidth - frameWidth) / 2, 0);
    const maxY = Math.max((scaledHeight - frameHeight) / 2, 0);
    return {
      x: clamp(next.x, -maxX, maxX),
      y: clamp(next.y, -maxY, maxY),
    };
  };

  useEffect(() => {
    Image.getSize(
      imageUri,
      (width, height) => {
        setImageSize({ width, height });
        setLoadingImage(false);
      },
      () => {
        Alert.alert("Image error", "Unable to load image for cropping.");
        navigation.goBack();
      },
    );
  }, [imageUri, navigation]);

  const onTouchStart = (touches: readonly { pageX: number; pageY: number }[]) => {
    if (touches.length === 1) {
      gestureMode.current = "pan";
      panStartTouch.current = { x: touches[0].pageX, y: touches[0].pageY };
      panStartOffset.current = offset;
      return;
    }

    if (touches.length >= 2) {
      gestureMode.current = "pinch";
      const [a, b] = touches;
      const dx = b.pageX - a.pageX;
      const dy = b.pageY - a.pageY;
      pinchStartDistance.current = Math.max(Math.hypot(dx, dy), 1);
      pinchStartScale.current = scale;
      pinchStartCenter.current = {
        x: (a.pageX + b.pageX) / 2,
        y: (a.pageY + b.pageY) / 2,
      };
      pinchStartOffset.current = offset;
    }
  };

  const onTouchMove = (touches: readonly { pageX: number; pageY: number }[]) => {
    if (touches.length === 1) {
      if (gestureMode.current !== "pan") {
        onTouchStart(touches);
        return;
      }
      const touch = touches[0];
      const dx = touch.pageX - panStartTouch.current.x;
      const dy = touch.pageY - panStartTouch.current.y;
      const next = {
        x: panStartOffset.current.x + dx,
        y: panStartOffset.current.y + dy,
      };
      setOffset(clampOffset(next, scale));
      return;
    }

    if (touches.length >= 2) {
      if (gestureMode.current !== "pinch") {
        onTouchStart(touches);
        return;
      }
      const [a, b] = touches;
      const dx = b.pageX - a.pageX;
      const dy = b.pageY - a.pageY;
      const distance = Math.max(Math.hypot(dx, dy), 1);
      const ratio = distance / pinchStartDistance.current;
      const nextScale = clamp(pinchStartScale.current * ratio, 1, 4);

      const center = {
        x: (a.pageX + b.pageX) / 2,
        y: (a.pageY + b.pageY) / 2,
      };
      const centerDelta = {
        x: center.x - pinchStartCenter.current.x,
        y: center.y - pinchStartCenter.current.y,
      };
      const nextOffset = {
        x: pinchStartOffset.current.x + centerDelta.x,
        y: pinchStartOffset.current.y + centerDelta.y,
      };

      setScale(nextScale);
      setOffset(clampOffset(nextOffset, nextScale));
    }
  };

  const onTouchEnd = (touches: readonly { pageX: number; pageY: number }[]) => {
    if (touches.length === 0) {
      gestureMode.current = "none";
      return;
    }
    onTouchStart(touches);
  };

  const handleContinue = async () => {
    try {
      setProcessing(true);
      const displayedWidth = baseSize.width * scale;
      const displayedHeight = baseSize.height * scale;
      const imageLeft = (frameWidth - displayedWidth) / 2 + offset.x;
      const imageTop = (frameHeight - displayedHeight) / 2 + offset.y;

      const originX = clamp((-imageLeft / displayedWidth) * imageSize.width, 0, imageSize.width - 1);
      const originY = clamp((-imageTop / displayedHeight) * imageSize.height, 0, imageSize.height - 1);
      const endX = clamp(((frameWidth - imageLeft) / displayedWidth) * imageSize.width, 1, imageSize.width);
      const endY = clamp(((frameHeight - imageTop) / displayedHeight) * imageSize.height, 1, imageSize.height);

      const cropWidth = Math.max(1, endX - originX);
      const cropHeight = Math.max(1, endY - originY);

      const result = await ImageManipulator.manipulateAsync(
        imageUri,
        [
          {
            crop: {
              originX: Math.round(originX),
              originY: Math.round(originY),
              width: Math.round(cropWidth),
              height: Math.round(cropHeight),
            },
          },
        ],
        { compress: 1, format: ImageManipulator.SaveFormat.JPEG },
      );

      navigation.replace("PhotoPreview", {
        imageUri: result.uri,
        source,
      });
    } catch {
      Alert.alert("Crop failed", "Please try again.");
    } finally {
      setProcessing(false);
    }
  };

  const handleRetake = () => {
    if (source === "camera") {
      navigation.replace("ScanCamera");
      return;
    }
    navigation.replace("Tools");
  };

  if (loadingImage) {
    return (
      <View style={[styles.root, styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={palette.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom + 8 }]}>
      <Text style={styles.title}>Adjust Crop</Text>
      <Text style={styles.subtitle}>Use touch to move and pinch to zoom, then continue.</Text>

      <View
        style={[styles.frame, { width: frameWidth, height: frameHeight }]}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={(event) => onTouchStart(event.nativeEvent.touches)}
        onResponderMove={(event) => onTouchMove(event.nativeEvent.touches)}
        onResponderRelease={(event) => onTouchEnd(event.nativeEvent.touches)}
        onResponderTerminate={(event) => onTouchEnd(event.nativeEvent.touches)}
      >
        <Image
          source={{ uri: imageUri }}
          style={{
            width: baseSize.width,
            height: baseSize.height,
            transform: [{ translateX: offset.x }, { translateY: offset.y }, { scale }],
          }}
        />
      </View>

      <View style={styles.actions}>
        <Pressable style={styles.secondaryButton} onPress={handleRetake} disabled={processing}>
          <Text style={styles.secondaryText}>
            {source === "camera" ? "Cancel / Retake" : "Cancel"}
          </Text>
        </Pressable>
        <Pressable style={styles.primaryButton} onPress={handleContinue} disabled={processing}>
          <Text style={styles.primaryText}>{processing ? "Processing..." : "Continue"}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: palette.background,
    paddingHorizontal: 18,
  },
  centered: {
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    marginTop: 12,
    fontSize: 26,
    fontWeight: "800",
    color: palette.text,
  },
  subtitle: {
    marginTop: 6,
    color: palette.textMuted,
    lineHeight: 20,
  },
  frame: {
    marginTop: 18,
    alignSelf: "center",
    borderRadius: 14,
    borderWidth: 2,
    borderColor: palette.primary,
    overflow: "hidden",
    backgroundColor: "#DCE8DF",
    alignItems: "center",
    justifyContent: "center",
  },
  actions: {
    marginTop: "auto",
    marginBottom: 6,
    flexDirection: "row",
    gap: 10,
  },
  primaryButton: {
    flex: 1,
    backgroundColor: palette.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  secondaryButton: {
    flex: 1,
    backgroundColor: palette.surface,
    borderRadius: 12,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: palette.border,
    alignItems: "center",
  },
  primaryText: {
    color: palette.surface,
    fontWeight: "700",
    fontSize: 15,
  },
  secondaryText: {
    color: palette.primaryDark,
    fontWeight: "700",
    fontSize: 15,
  },
});

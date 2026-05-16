import { NativeStackScreenProps } from "@react-navigation/native-stack";
import * as ImagePicker from "expo-image-picker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import React, { useEffect } from "react";
import {
  Alert,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { RootStackParamList } from "../navigation/types";
import { palette } from "../theme";

type Props = NativeStackScreenProps<RootStackParamList, "PhotoPreview">;

export function PhotoPreviewScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { imageUri, source } = route.params;

  useEffect(() => {
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

  const handleRetake = async () => {
    if (source === "camera") {
      navigation.replace("ScanCamera");
      return;
    }

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        "Permission required",
        "Please allow photo access to select another image.",
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 1,
    });

    if (result.canceled || !result.assets.length) {
      return;
    }

    navigation.replace("CropImage", {
      imageUri: result.assets[0].uri,
      source: "library",
    });
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={styles.content}>
        <Text style={styles.title}>Preview Photo</Text>
        <Text style={styles.subtitle}>
          Retake if the stem is unclear, otherwise continue to analysis.
        </Text>

        <Image source={{ uri: imageUri }} style={styles.image} />

        <View style={styles.actions}>
          <Pressable style={styles.secondaryButton} onPress={handleRetake}>
            <Text style={styles.secondaryText}>Retake</Text>
          </Pressable>
          <Pressable
            style={styles.primaryButton}
            onPress={() =>
              navigation.replace("Result", {
                mode: "new",
                imageUri,
                source,
              })
            }
          >
            <Text style={styles.primaryText}>Continue</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: palette.background,
  },
  content: {
    flex: 1,
    paddingHorizontal: 18,
    paddingVertical: 16,
    gap: 14,
  },
  title: {
    fontSize: 26,
    fontWeight: "800",
    color: palette.text,
  },
  subtitle: {
    fontSize: 14,
    color: palette.textMuted,
    lineHeight: 20,
  },
  image: {
    width: "100%",
    height: 250,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: "#DCE8DF",
  },
  actions: {
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

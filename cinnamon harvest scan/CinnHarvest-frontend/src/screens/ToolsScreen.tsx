import { MaterialCommunityIcons } from "@expo/vector-icons";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import * as ImagePicker from "expo-image-picker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import React, { useEffect } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";

import { BottomNav } from "../components/BottomNav";
import { RootStackParamList } from "../navigation/types";
import { palette } from "../theme";

type Props = NativeStackScreenProps<RootStackParamList, "Tools">;

export function ToolsScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();

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

  const pickFromLibrary = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        "Permission required",
        "Please allow photo access so you can upload an image.",
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

    navigation.navigate("CropImage", {
      imageUri: result.assets[0].uri,
      source: "library",
    });
  };

  return (
    <View style={styles.root}>
      <View style={styles.main}>
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingTop: insets.top + 12, minHeight: Math.max(620, height - insets.top - 92) },
          ]}
        >
          <View style={styles.topSection}>
            <Text style={styles.title}>Harvest Your Plant</Text>
            <Text style={[styles.subtitle, { marginBottom: 12 }]}>
              Upload a photo or continue to scan a cinnamon stem from camera with guided tips.
            </Text>
            <Text style={[styles.subtitle, { fontWeight: "600", marginBottom: 8 }]}>
              Stem Analysis
            </Text>

            <View style={styles.visualCard}>
              <View style={styles.visualRow}>
                <View style={styles.visualTile}>
                  <MaterialCommunityIcons
                    name="camera-outline"
                    size={30}
                    color={palette.primaryDark}
                  />
                  <Text style={styles.visualText}>Capture</Text>
                </View>
                <View style={styles.visualTile}>
                  <MaterialCommunityIcons
                    name="crop"
                    size={30}
                    color={palette.primaryDark}
                  />
                  <Text style={styles.visualText}>Crop</Text>
                </View>
                <View style={styles.visualTile}>
                  <MaterialCommunityIcons
                    name="chart-bar"
                    size={30}
                    color={palette.primaryDark}
                  />
                  <Text style={styles.visualText}>Result</Text>
                </View>
              </View>
            </View>

            <View style={[styles.heroCard, {display: "none"}]}>
              <View style={styles.heroIconWrap}>
                <MaterialCommunityIcons
                  name="sprout"
                  size={46}
                  color={palette.primaryDark}
                />
              </View>
              <View style={styles.heroTextWrap}>
                <Text style={styles.heroTitle}>Smart Cinnamon Assistant</Text>
                <Text style={styles.heroSubtitle}>
                  Capture clearly, crop the stem area, and get a fast maturity estimate.
                </Text>
              </View>
            </View>
            <View style={styles.actionGroup}>
              <Pressable style={styles.primaryButton} onPress={pickFromLibrary}>
                <MaterialCommunityIcons
                  name="upload"
                  size={20}
                  color={palette.surface}
                />
                <Text style={styles.primaryButtonText}>Upload Image</Text>
              </Pressable>

              <Pressable
                style={styles.secondaryButton}
                onPress={() => navigation.navigate("Tips")}
              >
                <MaterialCommunityIcons
                  name="camera"
                  size={20}
                  color={palette.primaryDark}
                />
                <Text style={styles.secondaryButtonText}>Scan Stem</Text>
              </Pressable>

              <Pressable
                style={styles.secondaryButton}
                onPress={() => navigation.navigate("ThicknessEstimator")}
              >
                <MaterialCommunityIcons
                  name="ruler"
                  size={20}
                  color={palette.primaryDark}
                />
                <Text style={styles.secondaryButtonText}>Estimate Months by Thickness</Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </View>

      <BottomNav
        activeTab="tools"
        onHomePress={() => navigation.navigate("Tools")}
        onTipsPress={() => navigation.navigate("Tips")}
        onHistoryPress={() => navigation.navigate("History")}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: palette.background,
  },
  main: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 18,
    paddingVertical: 16,
    gap: 18,
  },
  topSection: {
    gap: 12,
  },
  title: {
    fontSize: 26,
    fontWeight: "800",
    color: palette.text,
  },
  subtitle: {
    fontSize: 15,
    color: palette.textMuted,
    lineHeight: 21,
  },
  visualCard: {
    backgroundColor: palette.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 14,
  },
  visualRow: {
    flexDirection: "row",
    gap: 10,
  },
  visualTile: {
    flex: 1,
    backgroundColor: "#EAF1EC",
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 18,
    gap: 8,
  },
  visualText: {
    fontSize: 13,
    color: palette.primaryDark,
    fontWeight: "600",
  },
  actionGroup: {
    gap: 10,
    marginTop: "auto",
    paddingTop: 4,
  },
  heroCard: {
    marginTop: 2,
    backgroundColor: "#E7F0EA",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 110,
  },
  heroIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#D8E8DC",
    alignItems: "center",
    justifyContent: "center",
  },
  heroTextWrap: {
    flex: 1,
    gap: 3,
  },
  heroTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: palette.primaryDark,
  },
  heroSubtitle: {
    fontSize: 13,
    lineHeight: 19,
    color: palette.textMuted,
  },
  primaryButton: {
    backgroundColor: palette.primary,
    borderRadius: 14,
    paddingVertical: 14,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
  },
  secondaryButton: {
    backgroundColor: palette.surface,
    borderRadius: 14,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: palette.border,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
  },
  primaryButtonText: {
    color: palette.surface,
    fontSize: 16,
    fontWeight: "700",
  },
  secondaryButtonText: {
    color: palette.primaryDark,
    fontSize: 16,
    fontWeight: "700",
  },
});

import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import React, { useEffect } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { BottomNav } from "../components/BottomNav";
import { RootStackParamList } from "../navigation/types";
import { palette } from "../theme";

type Props = NativeStackScreenProps<RootStackParamList, "Tips">;

const tips = [
  "Center the stem within the camera frame clearly.",
  "Ensure there is sufficient lighting on the stem surface.",
  "Hold your phone steady to avoid blurred images.",
  "Use a white background for better focus (white sheet behind the focused stem area/portion).",
  "Keep 10-15 cm gap between camera and the stem when scanning.",
];

export function TipsScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();

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

  return (
    <View style={styles.root}>
      <View style={styles.main}>
        <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 12 }]}>
          <Text style={styles.title}>Scanning Tips</Text>
          <Text style={styles.subtitle}>
            Follow these steps for clear and reliable analysis.
          </Text>

          <View style={styles.tipCard}>
            {tips.map((tip, index) => (
              <View key={tip} style={styles.tipRow}>
                <View style={styles.indexCircle}>
                  <Text style={styles.indexText}>{index + 1}</Text>
                </View>
                <Text style={styles.tipText}>{tip}</Text>
              </View>
            ))}
          </View>

          <Pressable
            style={styles.scanNowButton}
            onPress={() => navigation.navigate("ScanCamera")}
          >
            <Text style={styles.scanNowText}>Scan Now</Text>
          </Pressable>
        </ScrollView>
      </View>

      <BottomNav
        activeTab="tips"
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
    paddingHorizontal: 18,
    paddingVertical: 16,
    paddingBottom: 16,
    gap: 18,
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
  tipCard: {
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 16,
    padding: 14,
    gap: 12,
  },
  tipRow: {
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
  },
  indexCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.primary,
    marginTop: 1,
  },
  indexText: {
    color: palette.surface,
    fontSize: 12,
    fontWeight: "700",
  },
  tipText: {
    flex: 1,
    fontSize: 14,
    color: palette.text,
    lineHeight: 20,
  },
  scanNowButton: {
    backgroundColor: palette.primary,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  scanNowText: {
    color: palette.surface,
    fontSize: 16,
    fontWeight: "700",
  },
});

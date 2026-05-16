import { MaterialCommunityIcons } from "@expo/vector-icons";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { RootStackParamList } from "../navigation/types";
import { palette } from "../theme";

type Props = NativeStackScreenProps<RootStackParamList, "Home">;

const homeActions = [
  {
    key: "cinnamon",
    title: "Cinnamon Stem Analyzer",
    subtitle: "Open tools for scan, tips, and history.",
    icon: "leaf-circle-outline" as const,
    enabled: true,
  },
  {
    key: "coming-1",
    title: "Quality Benchmark",
    subtitle: "Coming Soon",
    icon: "chart-box-outline" as const,
    enabled: false,
  },
  {
    key: "coming-2",
    title: "Batch Analyzer",
    subtitle: "Coming Soon",
    icon: "folder-multiple-image" as const,
    enabled: false,
  },
  {
    key: "coming-3",
    title: "Reports",
    subtitle: "Coming Soon",
    icon: "file-chart-outline" as const,
    enabled: false,
  },
];

export function HomeScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 18, paddingBottom: insets.bottom + 18 },
        ]}
      >
        <Text style={styles.title}>Cinnamon Insights</Text>
        <Text style={styles.subtitle}>
          Select a workspace. The cinnamon stem tool is ready now.
        </Text>

        <View style={styles.grid}>
          {homeActions.map((action) => (
            <Pressable
              key={action.key}
              disabled={!action.enabled}
              style={({ pressed }) => [
                styles.card,
                !action.enabled && styles.cardDisabled,
                action.enabled && pressed && styles.pressed,
              ]}
              onPress={() => navigation.navigate("Tools")}
            >
              <MaterialCommunityIcons
                name={action.icon}
                size={28}
                color={action.enabled ? palette.primary : palette.muted}
              />
              <Text style={[styles.cardTitle, !action.enabled && styles.textDisabled]}>
                {action.title}
              </Text>
              <Text style={[styles.cardSubtitle, !action.enabled && styles.textDisabled]}>
                {action.subtitle}
              </Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: palette.background,
  },
  content: {
    paddingHorizontal: 18,
    gap: 16,
  },
  title: {
    fontSize: 30,
    fontWeight: "800",
    color: palette.text,
  },
  subtitle: {
    fontSize: 15,
    color: palette.textMuted,
    lineHeight: 21,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  card: {
    width: "48%",
    backgroundColor: palette.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 14,
    minHeight: 160,
    justifyContent: "space-between",
  },
  cardDisabled: {
    opacity: 0.66,
  },
  cardTitle: {
    marginTop: 10,
    fontSize: 16,
    fontWeight: "700",
    color: palette.text,
  },
  cardSubtitle: {
    marginTop: 6,
    fontSize: 13,
    color: palette.textMuted,
    lineHeight: 18,
  },
  textDisabled: {
    color: palette.muted,
  },
  pressed: {
    transform: [{ scale: 0.98 }],
  },
});

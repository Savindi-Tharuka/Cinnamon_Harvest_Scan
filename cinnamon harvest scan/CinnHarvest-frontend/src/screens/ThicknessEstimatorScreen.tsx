import { MaterialCommunityIcons } from "@expo/vector-icons";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useMemo, useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ActivityIndicator,
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from "react-native";

import { estimateMonthsByThickness } from "../api/analysisApi";
import { BottomNav } from "../components/BottomNav";
import { RootStackParamList } from "../navigation/types";
import { palette } from "../theme";

type Props = NativeStackScreenProps<RootStackParamList, "ThicknessEstimator">;

function monthLabel(months: string): string {
  return months;
}

export function ThicknessEstimatorScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [thicknessInput, setThicknessInput] = useState("");
  const [months, setMonths] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = useMemo(() => !loading && thicknessInput.trim().length > 0, [loading, thicknessInput]);

  const handleEstimate = async () => {
    Keyboard.dismiss();
    const value = Number.parseFloat(thicknessInput.trim());
    if (!Number.isFinite(value) || value <= 0) {
      setError("Enter a valid thickness in centimeters.");
      setMonths(null);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const result = await estimateMonthsByThickness(value);
      setMonths(result.months);
    } catch (requestError) {
      setMonths(null);
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to estimate month period right now.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <View style={styles.root}>
        <View style={styles.main}>
          <View style={[styles.content, { paddingTop: insets.top + 14 }]}>
            <Pressable style={styles.backButton} onPress={() => navigation.goBack()}>
              <MaterialCommunityIcons name="chevron-left" size={24} color={palette.text} />
              <Text style={styles.backText}>Back</Text>
            </Pressable>

            <View style={styles.card}>
              <Text style={styles.title}>Thickness-Based Maturity Estimate</Text>
              <Text style={styles.subtitle}>
                Enter stem thickness in centimeters to get an estimated remaining period to maturity.
              </Text>

              <Text style={styles.inputLabel}>Stem Thickness (cm)</Text>
              <TextInput
                value={thicknessInput}
                onChangeText={setThicknessInput}
                placeholder="e.g. 1.2"
                placeholderTextColor={palette.muted}
                keyboardType="decimal-pad"
                style={styles.input}
              />

              <Pressable
                style={[styles.button, !canSubmit && styles.buttonDisabled]}
                onPress={handleEstimate}
                disabled={!canSubmit}
              >
                {loading ? (
                  <ActivityIndicator color={palette.surface} />
                ) : (
                  <Text style={styles.buttonText}>Calculate Month Period</Text>
                )}
              </Pressable>

              {error ? <Text style={styles.errorText}>{error}</Text> : null}
              {months !== null ? (
                <View style={styles.resultBox}>
                  <Text style={styles.resultLabel}>Estimated Time to Mature</Text>
                  <Text style={styles.resultValue}>{monthLabel(months)}</Text>
                </View>
              ) : null}
            </View>
          </View>
        </View>
        <BottomNav
          activeTab="tools"
          onHomePress={() => navigation.navigate("Tools")}
          onTipsPress={() => navigation.navigate("Tips")}
          onHistoryPress={() => navigation.navigate("History")}
        />
      </View>
    </TouchableWithoutFeedback>
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
    flex: 1,
    paddingHorizontal: 18,
    paddingBottom: 18,
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    marginBottom: 14,
  },
  backText: {
    fontSize: 15,
    color: palette.text,
    fontWeight: "600",
  },
  card: {
    flex: 1,
    backgroundColor: palette.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 16,
    gap: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: "800",
    color: palette.text,
  },
  subtitle: {
    fontSize: 14,
    color: palette.textMuted,
    lineHeight: 20,
    marginBottom: 2,
  },
  inputLabel: {
    fontSize: 13,
    color: palette.textMuted,
    fontWeight: "600",
  },
  input: {
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: palette.text,
    fontSize: 16,
    backgroundColor: "#F7FBF8",
  },
  button: {
    backgroundColor: palette.primary,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
    marginTop: 2,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: palette.surface,
    fontSize: 15,
    fontWeight: "700",
  },
  errorText: {
    color: palette.danger,
    fontSize: 13,
    lineHeight: 18,
  },
  resultBox: {
    marginTop: 2,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: "#EAF2ED",
    padding: 12,
    gap: 4,
  },
  resultLabel: {
    color: palette.textMuted,
    fontSize: 13,
  },
  resultValue: {
    color: palette.primaryDark,
    fontWeight: "800",
    fontSize: 22,
  },
});

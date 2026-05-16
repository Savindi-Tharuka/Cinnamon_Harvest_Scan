import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ActivityIndicator,
  Alert,
  Image,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import {
  deleteAnalysisById,
  estimateMonthsByThickness,
  getAnalysisById,
  uploadStemImage,
} from "../api/analysisApi";
import { ResultSkeleton } from "../components/ResultSkeleton";
import { StatusBadge } from "../components/StatusBadge";
import { RootStackParamList } from "../navigation/types";
import { palette } from "../theme";
import { AnalysisRecord, StemStatus } from "../types";

type Props = NativeStackScreenProps<RootStackParamList, "Result">;

function confidenceLabel(confidence: number): string {
  return `${Math.round(confidence * 100)}%`;
}

function getStatusMessage(status: StemStatus): string {
  if (status === "invalid") {
    return "Invalid image — upload only cinnamon stem bark.";
  }
  if (status === "matured") {
    return "Ready to harvest.";
  }
  if (status === "overmatured") {
    return "Harvest soon to avoid quality loss.";
  }
  return "Immature stem — further growth required.";
}

function maturityMonthsLabel(days: number): string {
  if (days < 30) {
    return "less than 1 month";
  }
  const months = Math.max(1, Math.round(days / 30));
  return `${months} ${months === 1 ? "month" : "months"}`;
}

function estimatedMonthsLabel(months: string): string {
  return months;
}

export function ResultScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { mode, imageUri, source, record: initialRecord, recordId } = route.params;
  const [record, setRecord] = useState<AnalysisRecord | null>(initialRecord ?? null);
  const [loading, setLoading] = useState(mode === "new" || !initialRecord);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(mode === "history");
  const [thicknessInput, setThicknessInput] = useState("");
  const [thicknessEstimateMonths, setThicknessEstimateMonths] = useState<string | null>(null);
  const [thicknessEstimateError, setThicknessEstimateError] = useState<string | null>(null);
  const [thicknessEstimateLoading, setThicknessEstimateLoading] = useState(false);
  const [invalidAutoDiscarding, setInvalidAutoDiscarding] = useState(false);
  const [isAlternativeExpanded, setIsAlternativeExpanded] = useState(false);
  const invalidDiscardAttemptedRef = useRef(false);

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

  const renderImageUrl = useMemo(() => {
    if (mode === "new" && imageUri && !record) {
      return imageUri;
    }
    return record?.photo.url;
  }, [imageUri, mode, record]);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
        setError(null);
        setLoading(true);

        if (mode === "new") {
          if (!imageUri) {
            throw new Error("Image is required for analysis.");
          }
          const uploaded = await uploadStemImage(imageUri);
          if (!cancelled) {
            setRecord(uploaded);
          }
          return;
        }

        if (!initialRecord && recordId) {
          const fetched = await getAnalysisById(recordId);
          if (!cancelled) {
            setRecord(fetched);
          }
        }
      } catch (runError) {
        if (!cancelled) {
          setError(
            runError instanceof Error
              ? runError.message
              : "Unable to load the result right now.",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [imageUri, initialRecord, mode, recordId]);

  useEffect(() => {
    if (
      mode !== "new"
      || !record
      || record.status !== "invalid"
      || invalidDiscardAttemptedRef.current
    ) {
      return;
    }

    invalidDiscardAttemptedRef.current = true;
    let cancelled = false;

    const discardInvalid = async () => {
      try {
        setInvalidAutoDiscarding(true);
        await deleteAnalysisById(record.id);
      } catch (discardError) {
        if (!cancelled) {
          Alert.alert(
            "Discard failed",
            discardError instanceof Error
              ? discardError.message
              : "Unable to auto-discard this invalid result.",
          );
        }
      } finally {
        if (!cancelled) {
          setInvalidAutoDiscarding(false);
        }
      }
    };

    discardInvalid();

    return () => {
      cancelled = true;
    };
  }, [mode, record]);

  const handleDiscard = async () => {
    if (!record || actionLoading) {
      return;
    }

    Alert.alert("Discard this result?", "This will permanently delete the record.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Discard",
        style: "destructive",
        onPress: async () => {
          try {
            setActionLoading(true);
            await deleteAnalysisById(record.id);
            navigation.reset({
              index: 0,
              routes: [{ name: "Tools" }],
            });
          } catch (deleteError) {
            Alert.alert(
              "Delete failed",
              deleteError instanceof Error
                ? deleteError.message
                : "Unable to delete the result.",
            );
          } finally {
            setActionLoading(false);
          }
        },
      },
    ]);
  };

  const handleSave = () => {
    setSaved(true);
    Alert.alert("Saved", "Result has been kept in history.");
    navigation.navigate("History");
  };

  const handleRetakeInvalid = () => {
    if (source === "camera") {
      navigation.replace("ScanCamera");
      return;
    }
    navigation.reset({
      index: 0,
      routes: [{ name: "Tools" }],
    });
  };

  const handleThicknessEstimate = async () => {
    Keyboard.dismiss();
    const parsed = Number.parseFloat(thicknessInput.trim());
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setThicknessEstimateError("Enter a valid thickness in centimeters.");
      setThicknessEstimateMonths(null);
      return;
    }

    try {
      setThicknessEstimateLoading(true);
      setThicknessEstimateError(null);
      const result = await estimateMonthsByThickness(parsed);
      setThicknessEstimateMonths(result.months);
    } catch (estimateError) {
      setThicknessEstimateMonths(null);
      setThicknessEstimateError(
        estimateError instanceof Error
          ? estimateError.message
          : "Unable to estimate maturity period right now.",
      );
    } finally {
      setThicknessEstimateLoading(false);
    }
  };

  const showBottomActions = Boolean(record) && !loading && !error;

  return (
    <View style={styles.root}>
      <ScrollView
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        onScrollBeginDrag={Keyboard.dismiss}
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + 12,
            paddingBottom: showBottomActions ? 16 : insets.bottom + 12,
          },
        ]}
      >
        <Text style={styles.title}>Analysis Result</Text>
        <Text style={styles.subtitle}>
          Review confidence and maturity before deciding what to keep.
        </Text>

        {loading ? (
          <ResultSkeleton />
        ) : error ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable style={styles.retryButton} onPress={() => navigation.replace("Result", route.params)}>
              <Text style={styles.retryText}>Try Again</Text>
            </Pressable>
          </View>
        ) : record ? (
          <View style={styles.card}>
            {renderImageUrl ? (
              <Image source={{ uri: renderImageUrl }} style={styles.image} />
            ) : (
              <View style={[styles.image, styles.imagePlaceholder]}>
                <ActivityIndicator color={palette.primary} />
              </View>
            )}

            <StatusBadge status={record.status} />
            <View style={styles.messageCard}>
              <Text style={styles.messageText}>{getStatusMessage(record.status)}</Text>
            </View>

            <View style={styles.row}>
              <Text style={styles.label}>Confidence</Text>
              <Text style={styles.value}>{confidenceLabel(record.confidence)}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>Analyzed Date</Text>
              <Text style={styles.value}>
                {new Date(record.analyzed_at).toLocaleString()}
              </Text>
            </View>
            {(typeof record.time_required_to_mature_days === "number"
              || typeof record.time_required_to_mature_range === "string") && (
              <>
                <View style={styles.row}>
                  <Text style={styles.label}>Estimated Time to Mature</Text>
                  <Text style={styles.value}>
                    {typeof record.time_required_to_mature_range === "string"
                      ? record.time_required_to_mature_range
                      : typeof record.time_required_to_mature_days === "number"
                        ? maturityMonthsLabel(record.time_required_to_mature_days)
                        : "-"}
                  </Text>
                </View>
                <Text style={styles.infoText}>
                  This is an estimate to give you a general idea. For a more accurate prediction, use the alternative method below.
                </Text>
              </>
            )}

            {record.status === "immatured" && (
              <View style={styles.accordionCard}>
                <Pressable
                  style={styles.accordionHeader}
                  onPress={() => setIsAlternativeExpanded((prev) => !prev)}
                >
                  <Text style={styles.alternativeTitle}>Alternative Maturity Estimate</Text>
                  <MaterialCommunityIcons
                    name={isAlternativeExpanded ? "chevron-up" : "chevron-down"}
                    size={20}
                    color={palette.primaryDark}
                  />
                </Pressable>

                {isAlternativeExpanded ? (
                  <View style={styles.accordionContent}>
                    <Text style={styles.alternativeSubtitle}>
                      Enter thickness in centimeters for an additional month estimate.
                    </Text>

                    <TextInput
                      value={thicknessInput}
                      onChangeText={setThicknessInput}
                      placeholder="Thickness (cm)"
                      placeholderTextColor={palette.muted}
                      keyboardType="decimal-pad"
                      style={styles.alternativeInput}
                    />

                    <Pressable
                      style={[
                        styles.alternativeButton,
                        thicknessEstimateLoading && styles.buttonDisabled,
                      ]}
                      onPress={handleThicknessEstimate}
                      disabled={thicknessEstimateLoading}
                    >
                      {thicknessEstimateLoading ? (
                        <ActivityIndicator color={palette.surface} />
                      ) : (
                        <Text style={styles.alternativeButtonText}>Calculate from Thickness</Text>
                      )}
                    </Pressable>

                    {thicknessEstimateError ? (
                      <Text style={styles.alternativeError}>{thicknessEstimateError}</Text>
                    ) : null}

                    {thicknessEstimateMonths !== null ? (
                      <>
                        <View style={styles.alternativeResultRow}>
                          <Text style={styles.label}>Estimated Time to Mature</Text>
                          <Text style={styles.value}>{estimatedMonthsLabel(thicknessEstimateMonths)}</Text>
                        </View>
                        <Text style={styles.infoText}>
                          This is generally more accurate based on stem thickness, but it may still vary due to other factors.
                        </Text>
                      </>
                    ) : null}
                  </View>
                ) : null}
              </View>
            )}
          </View>
        ) : null}
      </ScrollView>

      {showBottomActions && record ? (
        <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 10 }]}>
          {mode === "new" && !saved ? (
            record.status === "invalid" ? (
              <View style={{ gap: 10 }}>
                <Text style={styles.invalidHint}>
                  Invalid results are automatically discarded and will not be saved.
                </Text>
                <View style={styles.actions}>
                  <Pressable
                    style={[styles.primaryButton, invalidAutoDiscarding && styles.buttonDisabled]}
                    onPress={handleRetakeInvalid}
                    disabled={invalidAutoDiscarding}
                  >
                    <Text style={styles.primaryButtonText}>
                      {source === "camera" ? "Retake Photo" : "Choose Another Photo"}
                    </Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <View style={styles.actions}>
                <Pressable
                  style={styles.secondaryButton}
                  onPress={handleDiscard}
                  disabled={actionLoading}
                >
                  <Text style={styles.secondaryButtonText}>Discard</Text>
                </Pressable>
                <Pressable
                  style={styles.primaryButton}
                  onPress={handleSave}
                  disabled={actionLoading}
                >
                  <Text style={styles.primaryButtonText}>Save Result</Text>
                </Pressable>
              </View>
            )
          ) : (
            <View style={styles.actions}>
              <Pressable
                style={styles.primaryButton}
                onPress={() => navigation.navigate("History")}
                disabled={actionLoading}
              >
                <Text style={styles.primaryButtonText}>Back to History</Text>
              </Pressable>
            </View>
          )}
        </View>
      ) : null}
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
  card: {
    backgroundColor: palette.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 14,
    gap: 12,
  },
  image: {
    width: "100%",
    height: 250,
    borderRadius: 12,
    backgroundColor: "#DCE8DF",
  },
  imagePlaceholder: {
    alignItems: "center",
    justifyContent: "center",
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  messageCard: {
    backgroundColor: "#EAF2ED",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: palette.border,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  messageText: {
    color: palette.primaryDark,
    lineHeight: 20,
    fontWeight: "600",
  },
  label: {
    fontSize: 14,
    color: palette.textMuted,
    flex: 1,
  },
  value: {
    fontSize: 14,
    fontWeight: "700",
    color: palette.text,
    flex: 1,
    textAlign: "right",
  },
  infoText: {
    color: palette.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  accordionCard: {
    marginTop: 2,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: "#F3F8F5",
    overflow: "hidden",
  },
  accordionHeader: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  accordionContent: {
    borderTopWidth: 1,
    borderTopColor: palette.border,
    padding: 12,
    gap: 10,
  },
  alternativeTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: palette.text,
  },
  alternativeSubtitle: {
    color: palette.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  alternativeInput: {
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
    color: palette.text,
    backgroundColor: palette.surface,
    fontSize: 15,
  },
  alternativeButton: {
    backgroundColor: palette.primaryDark,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
  },
  alternativeButtonText: {
    color: palette.surface,
    fontWeight: "700",
    fontSize: 14,
  },
  alternativeError: {
    color: palette.danger,
    fontSize: 13,
    lineHeight: 18,
  },
  alternativeResultRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: palette.border,
    paddingTop: 10,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  bottomBar: {
    borderTopWidth: 1,
    borderTopColor: palette.border,
    backgroundColor: palette.surface,
    paddingHorizontal: 18,
    paddingTop: 10,
    gap: 10,
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
    justifyContent: "center",
  },
  secondaryButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 15,
  },
  secondaryButtonText: {
    color: palette.primaryDark,
    fontWeight: "700",
    fontSize: 15,
  },
  invalidHint: {
    color: palette.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  errorCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e5b1b1",
    backgroundColor: "#fff2f2",
    padding: 14,
    gap: 12,
  },
  errorText: {
    color: "#833b3b",
    lineHeight: 20,
  },
  retryButton: {
    alignSelf: "flex-start",
    backgroundColor: palette.primary,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  retryText: {
    color: palette.surface,
    fontWeight: "700",
  },
});

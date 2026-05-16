import DateTimePicker, {
  DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { deleteAnalysisById, listAnalyses } from "../api/analysisApi";
import { BottomNav } from "../components/BottomNav";
import { StatusBadge } from "../components/StatusBadge";
import { RootStackParamList } from "../navigation/types";
import { palette } from "../theme";
import { AnalysisRecord, StemStatus } from "../types";

type Props = NativeStackScreenProps<RootStackParamList, "History">;
type PickerField = "from" | "to" | null;
type StatusFilter = "all" | StemStatus;

const PAGE_SIZE = 10;

function startOfDayIso(date: Date): string {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next.toISOString();
}

function endOfDayIso(date: Date): string {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next.toISOString();
}

function StatusFilterChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.filterChip,
        active && styles.filterChipActive,
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

export function HistoryScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [records, setRecords] = useState<AnalysisRecord[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [dateFrom, setDateFrom] = useState<Date | null>(null);
  const [dateTo, setDateTo] = useState<Date | null>(null);
  const [pickerField, setPickerField] = useState<PickerField>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [initialLoading, setInitialLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const queryFilters = useMemo(
    () => ({
      status: statusFilter === "all" ? undefined : statusFilter,
      analyzedFrom: dateFrom ? startOfDayIso(dateFrom) : undefined,
      analyzedTo: dateTo ? endOfDayIso(dateTo) : undefined,
    }),
    [dateFrom, dateTo, statusFilter],
  );

  const loadPage = useCallback(
    async (targetPage: number, reset: boolean) => {
      if (reset) {
        setInitialLoading(true);
        setError(null);
      } else {
        setLoadingMore(true);
      }

      try {
        const response = await listAnalyses({
          page: targetPage,
          perPage: PAGE_SIZE,
          status: queryFilters.status,
          analyzedFrom: queryFilters.analyzedFrom,
          analyzedTo: queryFilters.analyzedTo,
        });

        setRecords((prev) =>
          reset ? response.data : [...prev, ...response.data],
        );
        setPage(targetPage);
        setHasMore(targetPage < response.pagination.total_pages);
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load history records.",
        );
      } finally {
        setInitialLoading(false);
        setLoadingMore(false);
        setRefreshing(false);
      }
    },
    [queryFilters.analyzedFrom, queryFilters.analyzedTo, queryFilters.status],
  );

  useEffect(() => {
    loadPage(1, true);
  }, [loadPage]);

  const onLoadMore = () => {
    if (!hasMore || loadingMore || initialLoading) {
      return;
    }
    loadPage(page + 1, false);
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadPage(1, true);
  };

  const onDelete = (record: AnalysisRecord) => {
    Alert.alert("Delete record?", "This action cannot be undone.", [
      {
        text: "Cancel",
        style: "cancel",
      },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteAnalysisById(record.id);
            setRecords((prev) => prev.filter((item) => item.id !== record.id));
          } catch (deleteError) {
            Alert.alert(
              "Delete failed",
              deleteError instanceof Error
                ? deleteError.message
                : "Unable to delete this record.",
            );
          }
        },
      },
    ]);
  };

  const onDateChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    if (event.type === "dismissed") {
      setPickerField(null);
      return;
    }

    if (!selectedDate || !pickerField) {
      return;
    }

    if (pickerField === "from") {
      setDateFrom(selectedDate);
    } else {
      setDateTo(selectedDate);
    }

    if (Platform.OS === "ios") {
      setPickerField(null);
    }
  };

  return (
    <View style={styles.root}>
      <View style={[styles.main, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Text style={styles.title}>Analysis History</Text>
          <Text style={styles.subtitle}>
            Filter by status and analyzed date.
          </Text>
        </View>

        <View style={styles.filters}>
          <Text style={styles.filterSectionLabel}>Maturity Status</Text>
          <View style={styles.filterRow}>
            <StatusFilterChip
              label="All"
              active={statusFilter === "all"}
              onPress={() => setStatusFilter("all")}
            />
            <StatusFilterChip
              label="Immatured"
              active={statusFilter === "immatured"}
              onPress={() => setStatusFilter("immatured")}
            />
            <StatusFilterChip
              label="Matured"
              active={statusFilter === "matured"}
              onPress={() => setStatusFilter("matured")}
            />
            <StatusFilterChip
              label="Overmatured"
              active={statusFilter === "overmatured"}
              onPress={() => setStatusFilter("overmatured")}
            />
          </View>

          <Text style={styles.filterSectionLabel}>Analyzed Date Range</Text>
          <View style={styles.dateFilterRow}>
            <View style={styles.dateButtonsLeft}>
              <Pressable
                style={styles.dateButton}
                onPress={() => setPickerField("from")}
              >
                <Text style={styles.dateButtonText}>
                  From: {dateFrom ? dateFrom.toLocaleDateString() : "Any"}
                </Text>
              </Pressable>
              <Pressable
                style={styles.dateButton}
                onPress={() => setPickerField("to")}
              >
                <Text style={styles.dateButtonText}>
                  To: {dateTo ? dateTo.toLocaleDateString() : "Any"}
                </Text>
              </Pressable>
            </View>
            <Pressable
              style={styles.clearDateButton}
              onPress={() => {
                setDateFrom(null);
                setDateTo(null);
              }}
            >
              <Text style={styles.clearDateText}>Clear</Text>
            </Pressable>
          </View>
        </View>

        {pickerField ? (
          <DateTimePicker
            value={(pickerField === "from" ? dateFrom : dateTo) ?? new Date()}
            mode="date"
            display={Platform.OS === "ios" ? "inline" : "default"}
            onChange={onDateChange}
          />
        ) : null}

        {initialLoading ? (
          <View style={styles.loadingWrapper}>
            <ActivityIndicator size="large" color={palette.primary} />
          </View>
        ) : error ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable style={styles.retryButton} onPress={onRefresh}>
              <Text style={styles.retryText}>Reload</Text>
            </Pressable>
          </View>
        ) : (
          <FlatList
            data={records}
            keyExtractor={(item) => item.id}
            contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 14 }]}
            refreshing={refreshing}
            onRefresh={onRefresh}
            onEndReachedThreshold={0.35}
            onEndReached={onLoadMore}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>No records found.</Text>
              </View>
            }
            ListFooterComponent={
              loadingMore ? (
                <View style={styles.footerLoading}>
                  <ActivityIndicator color={palette.primary} />
                </View>
              ) : null
            }
            renderItem={({ item }) => (
              <View style={styles.card}>
                <Image source={{ uri: item.photo.url }} style={styles.cardImage} />
                <View style={styles.cardContent}>
                  <StatusBadge status={item.status} />
                  <Text style={styles.cardDate}>
                    {new Date(item.analyzed_at).toLocaleString()}
                  </Text>
                  <View style={styles.cardActions}>
                    <Pressable
                      style={styles.viewButton}
                      onPress={() =>
                        navigation.navigate("Result", {
                          mode: "history",
                          record: item,
                        })
                      }
                    >
                      <Text style={styles.viewButtonText}>Open Result</Text>
                    </Pressable>
                    <Pressable
                      style={styles.deleteButton}
                      onPress={() => onDelete(item)}
                    >
                      <Text style={styles.deleteButtonText}>Delete</Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            )}
          />
        )}
      </View>

      <BottomNav
        activeTab="history"
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
  header: {
    paddingHorizontal: 18,
    gap: 4,
    paddingBottom: 8,
  },
  title: {
    fontSize: 26,
    fontWeight: "800",
    color: palette.text,
  },
  subtitle: {
    color: palette.textMuted,
  },
  filters: {
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 12,
    gap: 10,
  },
  filterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  filterSectionLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: palette.textMuted,
    letterSpacing: 0.2,
  },
  dateFilterRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  dateButtonsLeft: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    flex: 1,
  },
  filterChip: {
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  filterChipActive: {
    backgroundColor: palette.primary,
    borderColor: palette.primary,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: "700",
    color: palette.primaryDark,
  },
  filterChipTextActive: {
    color: palette.surface,
  },
  dateButton: {
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  dateButtonText: {
    fontSize: 12,
    fontWeight: "600",
    color: palette.primaryDark,
  },
  clearDateButton: {
    borderRadius: 10,
    backgroundColor: "#E8EEEA",
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  clearDateText: {
    fontSize: 12,
    fontWeight: "700",
    color: palette.textMuted,
  },
  listContent: {
    paddingHorizontal: 18,
    paddingTop: 12,
    gap: 10,
  },
  card: {
    backgroundColor: palette.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: palette.border,
    overflow: "hidden",
  },
  cardImage: {
    width: "100%",
    height: 140,
    backgroundColor: "#DFE8E1",
  },
  cardContent: {
    padding: 12,
    gap: 8,
  },
  cardDate: {
    color: palette.textMuted,
    fontSize: 13,
  },
  cardActions: {
    flexDirection: "row",
    gap: 8,
  },
  viewButton: {
    flex: 1,
    backgroundColor: palette.primary,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
  },
  deleteButton: {
    flex: 1,
    backgroundColor: "#FCE8E8",
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
  },
  viewButtonText: {
    color: palette.surface,
    fontWeight: "700",
    fontSize: 13,
  },
  deleteButtonText: {
    color: palette.danger,
    fontWeight: "700",
    fontSize: 13,
  },
  loadingWrapper: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  footerLoading: {
    paddingVertical: 12,
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 24,
  },
  emptyText: {
    color: palette.textMuted,
  },
  errorCard: {
    margin: 18,
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
  pressed: {
    opacity: 0.85,
  },
});

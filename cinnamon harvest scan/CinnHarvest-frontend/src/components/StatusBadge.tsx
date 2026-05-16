import { StyleSheet, Text, View } from "react-native";

import { palette, statusColors } from "../theme";
import { StemStatus } from "../types";

const statusLabelMap: Record<StemStatus, string> = {
  immatured: "Immatured",
  matured: "Matured",
  overmatured: "Overmatured",
  invalid: "Invalid",
};

export function StatusBadge({ status }: { status: StemStatus }) {
  return (
    <View style={[styles.badge, { backgroundColor: statusColors[status] }]}>
      <Text style={styles.text}>{statusLabelMap[status]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  text: {
    color: palette.surface,
    fontWeight: "700",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
});

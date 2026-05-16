import { StyleSheet, View } from "react-native";

import { palette } from "../theme";

export function ResultSkeleton() {
  return (
    <View style={styles.container}>
      <View style={styles.image} />
      <View style={styles.lineWide} />
      <View style={styles.lineMedium} />
      <View style={styles.lineWide} />
      <View style={styles.actions}>
        <View style={styles.button} />
        <View style={styles.button} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 12,
  },
  image: {
    height: 240,
    borderRadius: 16,
    backgroundColor: palette.skeleton,
  },
  lineWide: {
    height: 16,
    borderRadius: 8,
    backgroundColor: palette.skeleton,
    width: "85%",
  },
  lineMedium: {
    height: 16,
    borderRadius: 8,
    backgroundColor: palette.skeleton,
    width: "60%",
  },
  actions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 8,
  },
  button: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    backgroundColor: palette.skeleton,
  },
});

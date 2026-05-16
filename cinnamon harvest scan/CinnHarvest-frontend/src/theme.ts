import { StemStatus } from "./types";

export const palette = {
  background: "#F2F7F3",
  surface: "#FFFFFF",
  primary: "#C87137",
  primaryDark: "#A25A2C",
  secondary: "#B8745F",
  muted: "#7C8D82",
  border: "#D5E1D8",
  text: "#1E2A22",
  textMuted: "#56655B",
  success: "#D0825A",
  warning: "#C89B3C",
  danger: "#B34F4F",
  skeleton: "#DFE8E1",
};

export const statusColors: Record<StemStatus, string> = {
  immatured: palette.warning,
  matured: palette.success,
  overmatured: palette.danger,
  invalid: palette.muted,
};

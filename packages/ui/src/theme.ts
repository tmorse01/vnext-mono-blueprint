import { createTheme } from "@mui/material/styles";

export const vnextTheme = createTheme({
  palette: {
    mode: "light",
    primary: { main: "#174c42", dark: "#103a33", light: "#dcebe5" },
    secondary: { main: "#bd6d3b" },
    background: { default: "#f4f6f4", paper: "#ffffff" },
    text: { primary: "#1e2925", secondary: "#617069" },
    success: { main: "#2f7559" },
    warning: { main: "#a56b20" },
    error: { main: "#b7473f" },
  },
  shape: { borderRadius: 10 },
  typography: {
    fontFamily: '"Inter", "Segoe UI", sans-serif',
    h4: { fontWeight: 650, letterSpacing: "-0.035em" },
    h5: { fontWeight: 650, letterSpacing: "-0.025em" },
    h6: { fontWeight: 650 },
    button: { textTransform: "none", fontWeight: 600 },
  },
  components: {
    MuiCard: { styleOverrides: { root: { border: "1px solid #e5eae6", boxShadow: "0 2px 10px rgba(27,52,41,.035)" } } },
    MuiButton: { defaultProps: { disableElevation: true } },
    MuiTableCell: { styleOverrides: { head: { color: "#65726b", fontWeight: 700, fontSize: 12 } } },
  },
});

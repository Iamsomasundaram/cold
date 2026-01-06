import { createTheme } from "@mui/material/styles";

export const theme = createTheme({
  palette: {
    mode: "light",
    primary: {
      main: "#0b7a75",
      contrastText: "#f7f2e7",
    },
    secondary: {
      main: "#f2b880",
    },
    error: {
      main: "#d1495b",
    },
    info: {
      main: "#5fa8d3",
    },
    background: {
      default: "#f7f2e7",
      paper: "rgba(255,255,255,0.92)",
    },
    text: {
      primary: "#1f1b16",
      secondary: "#4f5b55",
    },
  },
  typography: {
    fontFamily: '"Instrument Sans", "Space Grotesk", sans-serif',
    h1: {
      fontFamily: '"Space Grotesk", "Instrument Sans", sans-serif',
      fontWeight: 600,
    },
    h2: {
      fontFamily: '"Space Grotesk", "Instrument Sans", sans-serif',
      fontWeight: 600,
    },
    h3: {
      fontFamily: '"Space Grotesk", "Instrument Sans", sans-serif',
      fontWeight: 600,
    },
  },
  shape: {
    borderRadius: 16,
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: "none",
          fontWeight: 600,
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          fontWeight: 600,
        },
      },
    },
  },
});

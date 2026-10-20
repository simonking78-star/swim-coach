import {
  BarElement, CategoryScale, Chart as ChartJS, Filler, Legend, LineElement, LinearScale, PointElement, Tooltip
} from "chart.js";

// Register the Chart.js parts the Statistics screens use. Imported only by
// lazily-loaded screens, so Chart.js never weighs on the app's first load.
ChartJS.register(LinearScale, CategoryScale, PointElement, LineElement, BarElement, Filler, Tooltip, Legend);

export const C = {
  sc: "#2a78d6", lc: "#0f7a3e", pb: "#f2a340",
  a: "#2a78d6", b: "#d9480f",
  navy: "#0b2545", accent: "#00a8e8",
  wcqt: "#888780", lccqt: "#b07030", lccqtlc: "#1a8c64",
  grid: "rgba(0,0,0,.06)"
};

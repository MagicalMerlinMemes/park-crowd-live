export const COLORS = {
  "Quieter than usual": "#2ecc71",
  "Normal": "#f1c40f",
  "Busier than usual": "#e67e22",
  "Very busy for this ride": "#e74c3c",
  "Not enough history": "#5dade2",
  "No posted wait": "#b8c2cc",
  "Down": "#7f1d1d",
  "Refurbishment": "#8e7cc3",
  "Closed": "#9aa0a6",
  "Park closed": "#9aa0a6",
};

// States where the ride has no usable wait number.
export const NO_WAIT = new Set([
  "Park closed",
  "Closed",
  "Down",
  "Refurbishment",
  "No posted wait",
]);

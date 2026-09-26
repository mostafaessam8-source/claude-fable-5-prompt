"""SAR visual identity + validated data-viz palette (single source of truth)."""

# Brand chrome (headers, navigation) - SAR Blue / SAR Black
SAR_BLUE = "#00778B"
SAR_BLUE_DARK = "#005A69"
SAR_BLACK = "#3D3935"
SURFACE = "#FCFCFB"
PAGE_BG = "#EEF2F4"
CARD_BG = "#FFFFFF"
BORDER = "#D9DEE2"
TEXT = "#1E1E1E"
TEXT_2 = "#52514E"
TEXT_MUTED = "#8A8984"
GRID = "#E6E6E3"

# Categorical series (fixed order, validated for CVD separation)
SERIES = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948"]
PLANNED = SERIES[0]     # blue
FORECAST = SERIES[1]    # orange
ACTUAL = SERIES[2]      # aqua
BASELINE_BAR = "#B9C3CC"
REMAINING_BAR = "#9ec5f4"

# Status (reserved; always shown with a text label / icon)
GOOD = "#0ca30c"
WARNING = "#fab219"
SERIOUS = "#ec835a"
CRITICAL = "#d03b3b"
NEUTRAL = "#7F8C8D"

STATUS_COLORS = {"good": GOOD, "warn": WARNING, "bad": CRITICAL, "na": NEUTRAL, "neutral": SAR_BLACK}
STATUS_ICON = {"good": "▲", "warn": "●", "bad": "▼", "na": "–", "neutral": ""}
RISK_COLORS = {"Low": GOOD, "Medium": WARNING, "High": SERIOUS, "Very High": CRITICAL}
BUCKET_COLORS = {"Completed": SERIES[5], "In Progress": SERIES[0], "Not Started": "#B9C3CC", "Delayed": CRITICAL}
STATUS_TEXT_COLORS = {"Completed": GOOD, "In Progress": SERIES[0], "Planned": TEXT_2, "Delayed": SERIOUS,
                      "Critical": CRITICAL, "Overdue": CRITICAL, "Not in Current": NEUTRAL}
FONT = "Segoe UI"

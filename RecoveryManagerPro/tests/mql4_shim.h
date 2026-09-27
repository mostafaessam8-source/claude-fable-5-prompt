// mql4_shim.h - minimal MQL4 built-ins so the portable Recovery Manager Pro
// headers (RM_Types.mqh, RM_Calc.mqh, RM_Planner.mqh) compile natively.
// Only pure math is shimmed; no trading API is emulated.
#pragma once
#include <cmath>
#include <algorithm>

inline double MathPow(double b, double e) { return std::pow(b, e); }
inline double MathFloor(double v) { return std::floor(v); }
inline double MathCeil(double v) { return std::ceil(v); }
inline double MathRound(double v) { return std::round(v); }
inline double MathAbs(double v) { return std::fabs(v); }
inline double MathMax(double a, double b) { return a > b ? a : b; }
inline double MathMin(double a, double b) { return a < b ? a : b; }
inline double MathSqrt(double v) { return std::sqrt(v); }
inline double NormalizeDouble(double v, int digits)
  {
   double f = std::pow(10.0, digits);
   return std::round(v * f) / f;
  }

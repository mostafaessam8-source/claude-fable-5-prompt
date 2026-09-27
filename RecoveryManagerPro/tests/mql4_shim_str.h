// mql4_shim_str.h - MQL4 string built-ins used by the portable RM_Distance.mqh,
// for the native calculation tests only (the simulator/lint headers declare their own).
#pragma once
#include <string>
#include <cstdlib>
#include <cctype>
typedef std::string string;
inline int StringLen(const string &s) { return (int)s.size(); }
inline string StringSubstr(const string &s, int start, int len = -1)
  { if(start >= (int)s.size()) return ""; return len < 0 ? s.substr(start) : s.substr(start, len); }
inline int StringFind(const string &s, const string &m, int start = 0)
  { size_t p = s.find(m, start); return p == string::npos ? -1 : (int)p; }
inline bool StringToUpper(string &s) { for(auto &c : s) c = (char)std::toupper((unsigned char)c); return true; }
inline unsigned short StringGetCharacter(const string &s, int pos)
  { return (pos >= 0 && pos < (int)s.size()) ? (unsigned short)(unsigned char)s[pos] : 0; }
inline double StringToDouble(const string &s) { return std::atof(s.c_str()); }

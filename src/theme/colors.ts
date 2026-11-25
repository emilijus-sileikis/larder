export interface ThemeColors {
  bg: string;
  surface: string;
  surfaceAlt: string;
  surfaceElevated: string;
  border: string;
  borderStrong: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  primary: string;
  primaryDark: string;
  primarySoft: string;
  primaryText: string;
  accent: string;
  accentSoft: string;
  accentText: string;
  warning: string;
  warningSoft: string;
  danger: string;
  dangerSoft: string;
  white: string;
  overlay: string;
  shadow: string;
}

export const LIGHT_COLORS: ThemeColors = {
  bg: '#FAF7F2',
  surface: '#FFFFFF',
  surfaceAlt: '#F2ECE2',
  surfaceElevated: '#FFFDF9',
  border: '#E6DDD0',
  borderStrong: '#D4C7B4',
  text: '#23201C',
  textSecondary: '#655E54',
  textMuted: '#999083',
  primary: '#4A7C59',
  primaryDark: '#386245',
  primarySoft: '#E6F0E9',
  primaryText: '#2E543A',
  accent: '#C86D4E',
  accentSoft: '#FAECE6',
  accentText: '#9D4B2F',
  warning: '#C58624',
  warningSoft: '#FDF3E1',
  danger: '#C24A3E',
  dangerSoft: '#FCEAE8',
  white: '#FFFFFF',
  overlay: 'rgba(28, 25, 21, 0.48)',
  shadow: '#23201C',
};

export const DARK_COLORS: ThemeColors = {
  bg: '#141513',
  surface: '#1D1F1C',
  surfaceAlt: '#262924',
  surfaceElevated: '#232621',
  border: '#32362F',
  borderStrong: '#444A40',
  text: '#F4F1EA',
  textSecondary: '#B5B0A5',
  textMuted: '#7F7B72',
  primary: '#73A982',
  primaryDark: '#5A8F69',
  primarySoft: '#1E2E23',
  primaryText: '#A8D4B4',
  accent: '#E08667',
  accentSoft: '#35221B',
  accentText: '#F4B199',
  warning: '#E5A94C',
  warningSoft: '#332816',
  danger: '#E06C60',
  dangerSoft: '#351D1B',
  white: '#FFFFFF',
  overlay: 'rgba(0, 0, 0, 0.68)',
  shadow: '#000000',
};

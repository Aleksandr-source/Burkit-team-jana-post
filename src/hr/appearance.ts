import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';

export type ThemeChoice = 'light' | 'dark' | 'system';
export type Wallpaper = 'plain' | 'mist' | 'aurora' | 'sunset' | 'ocean' | 'dots' | 'custom';
export type TextSize = 'small' | 'default' | 'large' | 'extraLarge';
export interface Appearance {
  theme: ThemeChoice;
  accent: string;
  wallpaper: Wallpaper;
  textSize: TextSize;
  gradientFrom: string;
  gradientTo: string;
  gradientAngle: number;
}

const STORAGE_KEY = 'asar-hr-appearance-v1';
const HEX = /^#[0-9a-f]{6}$/i;
const channels = (hex: string) => hex.slice(1).match(/../g)!.map(value => parseInt(value, 16));
function luminance(hex: string) {
  return channels(hex).map(value => {
    const linear = value / 255;
    return linear <= .04045 ? linear / 12.92 : ((linear + .055) / 1.055) ** 2.4;
  }).reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0);
}
function contrast(first: string, second: string) {
  const values = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (values[0] + .05) / (values[1] + .05);
}
function mix(first: string, second: string, weight: number) {
  const a = channels(first), b = channels(second);
  return '#' + a.map((value, index) => Math.round(value * weight + b[index] * (1 - weight)).toString(16).padStart(2, '0')).join('');
}
function readableAccent(accent: string, dark: boolean) {
  const backgrounds = dark ? ['#1d2532', '#242e3e', '#2b374a'] : ['#ffffff', '#f0f2f8', '#f8f9fc'];
  const target = channels(dark ? '#ffffff' : '#171f35');
  const original = channels(accent);
  for (let step = 0; step <= 20; step++) {
    const color = '#' + original.map((value, index) => Math.round(value + (target[index] - value) * step / 20).toString(16).padStart(2, '0')).join('');
    const selected = mix(color, backgrounds[0], .16);
    if ([...backgrounds, selected].every(background => contrast(color, background) >= 4.5)) return color;
  }
  return dark ? '#ffffff' : '#171f35';
}
export const DEFAULT_APPEARANCE: Appearance = {
  theme: 'dark', accent: '#7662e4', wallpaper: 'mist', textSize: 'default',
  gradientFrom: '#6579e8', gradientTo: '#c572b8', gradientAngle: 135,
};
export const ACCENTS = [
  { key: 'accentViolet', color: '#7662e4' }, { key: 'accentBlue', color: '#3879e8' },
  { key: 'accentCyan', color: '#0795a8' }, { key: 'accentGreen', color: '#24865c' },
  { key: 'accentOrange', color: '#cf6929' }, { key: 'accentRose', color: '#ca527e' },
];
export const WALLPAPERS: { id: Wallpaper; key: string }[] = [
  { id: 'plain', key: 'wallpaperPlain' }, { id: 'mist', key: 'wallpaperMist' },
  { id: 'aurora', key: 'wallpaperAurora' }, { id: 'sunset', key: 'wallpaperSunset' },
  { id: 'ocean', key: 'wallpaperOcean' }, { id: 'dots', key: 'wallpaperDots' },
  { id: 'custom', key: 'wallpaperCustom' },
];
export const TEXT_SIZES: { id: TextSize; key: string; scale: number }[] = [
  { id: 'small', key: 'textSmall', scale: .9 }, { id: 'default', key: 'textDefault', scale: 1 },
  { id: 'large', key: 'textLarge', scale: 1.1 }, { id: 'extraLarge', key: 'textExtraLarge', scale: 1.2 },
];

// Stored values only select known options; arbitrary CSS and URLs are never restored.
function normalize(value: unknown): Appearance {
  const source = value && typeof value === 'object' ? value as Partial<Appearance> : {};
  return {
    theme: ['light', 'dark', 'system'].includes(source.theme) ? source.theme : DEFAULT_APPEARANCE.theme,
    accent: typeof source.accent === 'string' && HEX.test(source.accent) ? source.accent.toLowerCase() : DEFAULT_APPEARANCE.accent,
    wallpaper: WALLPAPERS.some(item => item.id === source.wallpaper) ? source.wallpaper : DEFAULT_APPEARANCE.wallpaper,
    textSize: TEXT_SIZES.some(item => item.id === source.textSize) ? source.textSize : DEFAULT_APPEARANCE.textSize,
    gradientFrom: typeof source.gradientFrom === 'string' && HEX.test(source.gradientFrom) ? source.gradientFrom : DEFAULT_APPEARANCE.gradientFrom,
    gradientTo: typeof source.gradientTo === 'string' && HEX.test(source.gradientTo) ? source.gradientTo : DEFAULT_APPEARANCE.gradientTo,
    gradientAngle: Number.isFinite(source.gradientAngle) ? Math.min(360, Math.max(0, Math.round(source.gradientAngle))) : DEFAULT_APPEARANCE.gradientAngle,
  };
}

function readPreferences(): Appearance {
  try { return normalize(JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')); }
  catch { return { ...DEFAULT_APPEARANCE }; }
}

export function wallpaperBackground(preferences: Appearance, dark: boolean): string {
  const base = dark ? '#141d2c' : '#f3f6fc';
  const rgb = preferences.accent.match(/[0-9a-f]{2}/gi)?.map(value => parseInt(value, 16)).join(' ') || '118 98 228';
  switch (preferences.wallpaper) {
    case 'plain': return base;
    case 'mist': return `radial-gradient(ellipse at 95% 5%, rgb(${rgb} / ${dark ? '.2' : '.15'}), transparent 65%), ${base}`;
    case 'aurora': return dark
      ? 'radial-gradient(ellipse at 0% 0%, #1b473d, transparent 65%), radial-gradient(ellipse at 100% 100%, #423161, transparent 70%), #142531'
      : 'radial-gradient(ellipse at 0% 0%, #c9ede3, transparent 65%), radial-gradient(ellipse at 100% 100%, #e5d1f4, transparent 70%), #edf3fb';
    case 'sunset': return dark ? 'linear-gradient(130deg, #382c3c, #4b2839 55%, #3c342c)' : 'linear-gradient(130deg, #f8e4d6, #f0dae6 55%, #e1dff4)';
    case 'ocean': return dark ? 'linear-gradient(135deg, #173347, #183e43 55%, #223651)' : 'linear-gradient(135deg, #d2e9f8, #ccece8 55%, #e2e7f9)';
    case 'dots': return `radial-gradient(circle at 1px 1px, rgb(${rgb} / ${dark ? '.23' : '.2'}) 1px, transparent 0) 0 0 / 20px 20px, ${base}`;
    case 'custom': return `linear-gradient(${dark ? '#1118278a, #1118278a' : '#ffffff80, #ffffff80'}), linear-gradient(${preferences.gradientAngle}deg, ${preferences.gradientFrom}, ${preferences.gradientTo})`;
  }
}

export function useAppearance() {
  const [preferences, setPreferences] = useState<Appearance>(readPreferences);
  const [systemDark, setSystemDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches);
  const [saved, setSaved] = useState(true);
  const dark = preferences.theme === 'dark' || (preferences.theme === 'system' && systemDark);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const changed = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    media.addEventListener('change', changed);
    return () => media.removeEventListener('change', changed);
  }, []);
  useEffect(() => {
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
    document.documentElement.style.backgroundColor = dark ? '#141923' : '#f4f5f9';
  }, [dark]);
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences)); setSaved(true); }
    catch { setSaved(false); }
  }, [preferences]);
  useEffect(() => {
    const changed = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) {
        try { setPreferences(normalize(JSON.parse(event.newValue || 'null'))); setSaved(true); }
        catch { /* A malformed value in another tab cannot break this workspace. */ }
      }
    };
    window.addEventListener('storage', changed);
    return () => window.removeEventListener('storage', changed);
  }, []);

  const change = useCallback((patch: Partial<Appearance>) => {
    setPreferences(previous => normalize({ ...previous, ...patch }));
  }, []);
  const reset = useCallback(() => change({ ...DEFAULT_APPEARANCE }), [change]);
  const style = useMemo(() => ({
    '--hr-accent': preferences.accent,
    '--hr-accent-foreground': contrast(preferences.accent, '#ffffff') >= 4.5 ? '#ffffff' : '#000000',
    '--hr-accent-hover': mix(preferences.accent, contrast(preferences.accent, '#ffffff') >= 4.5 ? '#000000' : '#ffffff', .88),
    '--hr-accent-text': readableAccent(preferences.accent, dark),
    '--hr-accent-rgb': preferences.accent.match(/[0-9a-f]{2}/gi)?.map(value => parseInt(value, 16)).join(' '),
    '--hr-text-scale': TEXT_SIZES.find(item => item.id === preferences.textSize)?.scale || 1,
    '--hr-chat-wallpaper': wallpaperBackground(preferences, dark),
  }) as CSSProperties, [preferences, dark]);

  return { preferences, change, reset, saved, dark, style };
}

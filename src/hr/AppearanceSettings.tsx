import { Check, MessageCircle, Monitor, Moon, Palette, RotateCcw, Send, Sun } from 'lucide-react';
import type { CSSProperties } from 'react';
import { useEffect, useState } from 'react';
import { ACCENTS, TEXT_SIZES, WALLPAPERS, wallpaperBackground } from './appearance';
import type { Appearance, ThemeChoice } from './appearance';
import type { Translator } from './i18n';

interface Props {
  preferences: Appearance;
  change: (patch: Partial<Appearance>) => void;
  reset: () => void;
  dark: boolean;
  saved: boolean;
  t: Translator;
}

const themes: { id: ThemeChoice; key: string; icon: typeof Sun }[] = [
  { id: 'light', key: 'themeLight', icon: Sun },
  { id: 'dark', key: 'themeDark', icon: Moon },
  { id: 'system', key: 'themeSystem', icon: Monitor },
];

export default function AppearanceSettings({ preferences, change, reset, dark, saved, t }: Props) {
  const [accentDraft, setAccentDraft] = useState(preferences.accent);
  useEffect(() => setAccentDraft(preferences.accent), [preferences.accent]);
  function editAccent(value: string) {
    setAccentDraft(value);
    const color = value.startsWith('#') ? value : `#${value}`;
    if (/^#[0-9a-f]{6}$/i.test(color)) change({ accent: color });
  }
  return (
    <div className="hr-appearance-settings">
      <div className="hr-appearance-controls">
        <fieldset className="hr-setting-section">
          <legend className="hr-setting-heading">{t('theme')}</legend>
          <div className="hr-theme-options">
            {themes.map(({ id, key, icon: Icon }) => <button type="button" className={`hr-theme-option theme-${id}`} aria-pressed={preferences.theme === id} key={id} onClick={() => change({ theme: id })}>
              <span className="hr-theme-mini" aria-hidden="true"><span className="mini-sidebar" /><span className="mini-lines"><i /><i /><i /></span></span>
              <span><Icon size={15} aria-hidden="true" />{t(key)}{preferences.theme === id && <Check size={14} aria-hidden="true" />}</span>
            </button>)}
          </div>
          <p className="hr-setting-description">{t('themeSystemHint')}</p>
        </fieldset>

        <fieldset className="hr-setting-section">
          <legend className="hr-setting-heading">{t('accentColor')}</legend>
          <div className="hr-accent-options" role="group" aria-label={t('chooseAccent')}>
            {ACCENTS.map(({ color, key }) => <button type="button" className="hr-accent-option" key={color} aria-label={t(key)} title={t(key)} aria-pressed={preferences.accent === color} onClick={() => change({ accent: color })} style={{ '--hr-swatch': color } as CSSProperties}>
              {preferences.accent === color && <Check size={18} aria-hidden="true" />}
            </button>)}
          </div>
          <div className="hr-custom-accent"><Palette size={16} aria-hidden="true" /><span>{t('customColor')}</span><input className="hr-accent-hex" type="text" aria-label={t('accentHex')} value={accentDraft} maxLength={7} spellCheck={false} autoComplete="off" onChange={event => editAccent(event.target.value)} onBlur={() => setAccentDraft(preferences.accent)} /><input type="color" aria-label={t('customColor')} value={preferences.accent} onChange={event => change({ accent: event.target.value })} /></div>
        </fieldset>

        <fieldset className="hr-setting-section">
          <legend className="hr-setting-heading">{t('wallpaper')}</legend>
          <p className="hr-setting-description">{t('wallpaperDesc')}</p>
          <div className="hr-wallpaper-options">
            {WALLPAPERS.map(({ id, key }) => <button type="button" className="hr-wallpaper-option" aria-pressed={preferences.wallpaper === id} onClick={() => change({ wallpaper: id })} key={id}>
              <span className="hr-wallpaper-swatch" style={{ background: wallpaperBackground({ ...preferences, wallpaper: id }, dark) }} aria-hidden="true">
                {preferences.wallpaper === id && <Check size={17} />}
              </span>
              <span>{t(key)}</span>
            </button>)}
          </div>
          {preferences.wallpaper === 'custom' && <div className="hr-gradient-controls">
            <label>{t('gradientFrom')}<input type="color" value={preferences.gradientFrom} onChange={event => change({ gradientFrom: event.target.value })} /></label>
            <label>{t('gradientTo')}<input type="color" value={preferences.gradientTo} onChange={event => change({ gradientTo: event.target.value })} /></label>
            <label className="hr-gradient-angle"><span>{t('gradientDirection')} <strong>{preferences.gradientAngle}°</strong></span><input type="range" min="0" max="360" step="15" value={preferences.gradientAngle} onChange={event => change({ gradientAngle: Number(event.target.value) })} /></label>
          </div>}
        </fieldset>

        <fieldset className="hr-setting-section">
          <legend className="hr-setting-heading">{t('textSize')}</legend>
          <div className="hr-font-options">
            {TEXT_SIZES.map(({ id, key, scale }) => <button type="button" className="hr-font-option" aria-pressed={preferences.textSize === id} onClick={() => change({ textSize: id })} key={id}>
              <span style={{ fontSize: `${15 * scale}px` }} aria-hidden="true">Aa</span><span>{t(key)}</span>
            </button>)}
          </div>
        </fieldset>
        <button type="button" className="hr-button secondary hr-reset-appearance" onClick={reset}><RotateCcw size={15} />{t('resetAppearance')}</button>
        <p className={`hr-setting-description hr-appearance-save ${!saved ? 'save-error' : ''}`} role="status">{t(saved ? 'appearanceSaved' : 'appearanceSaveError')}</p>
      </div>

      <aside className="hr-appearance-preview" aria-label={t('preview')}>
        <span className="hr-setting-heading">{t('preview')}</span>
        <div className="hr-preview-window">
          <div className="hr-preview-top"><span className="hr-jana-orb"><MessageCircle size={18} /></span><div><strong>{t('assistantName')}</strong><span>{t('assistantDesc')}</span></div></div>
          <div className="hr-preview-messages" style={{ background: wallpaperBackground(preferences, dark) }}>
            <div className="hr-preview-bubble user">{t('previewQuestion')}<span>12:40 <Check size={12} /></span></div>
            <div className="hr-preview-bubble">{t('previewAnswer')}<span>12:40</span></div>
          </div>
          <div className="hr-preview-composer"><span>{t('askPlaceholder')}</span><span className="hr-preview-send"><Send size={16} /></span></div>
        </div>
      </aside>
    </div>
  );
}

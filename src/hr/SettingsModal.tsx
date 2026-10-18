import Select from './Select';
import { ChevronRight, Monitor, Moon, Palette, Sun } from 'lucide-react';
import type { Appearance, ThemeChoice } from './appearance';
import { TEXT_SIZES } from './appearance';
import type { Lang } from './types';
import type { Translator } from './i18n';
import Modal from './Modal';
import './settings.css';

interface Props {
  lang: Lang; t: Translator; close: () => void; saved: boolean;
  preferences: Appearance; change: (patch: Partial<Appearance>) => void;
  changeLanguage: (lang: Lang) => void; openAppearance: () => void;
}
const themes: { id: ThemeChoice; key: string; icon: typeof Sun }[] = [
  { id: 'light', key: 'themeLight', icon: Sun }, { id: 'dark', key: 'themeDark', icon: Moon }, { id: 'system', key: 'themeSystemShort', icon: Monitor },
];

export default function SettingsModal({ lang, t, close, preferences, change, saved, changeLanguage, openAppearance }: Props) {
  return <Modal title={t('settings')} close={close} t={t} className="hr-settings-dialog">
    <div className="hr-preferences">
      <fieldset><legend>{t('theme')}</legend><div className="hr-preference-themes">{themes.map(({ id, key, icon: Icon }) => <button type="button" key={id} aria-pressed={preferences.theme === id} onClick={() => change({ theme: id })}><Icon size={17} /><span>{t(key)}</span></button>)}</div></fieldset>
      <label className="hr-preference-row"><span>{t('language')}</span><Select aria-label={t('language')}  value={lang} onChange={event => changeLanguage(event.target.value as Lang)}><option value="ru">Русский</option><option value="kk">Қазақша</option><option value="en">English</option></Select></label>
      <label className="hr-preference-row"><span>{t('textSize')}</span><Select aria-label={t('textSize')}  value={preferences.textSize} onChange={event => change({ textSize: event.target.value as Appearance['textSize'] })}>{TEXT_SIZES.map(item => <option key={item.id} value={item.id}>{t(item.key)}</option>)}</Select></label>
      <button className="hr-preference-more" onClick={openAppearance}><Palette size={18} /><span>{t('colorsAndBackground')}</span><ChevronRight size={17} /></button>
    </div>
    <div className="hr-preference-footer"><p className={!saved ? 'is-error' : ''} role="status">{t(saved ? 'settingsSaved' : 'appearanceSaveError')}</p><button className="hr-button primary" onClick={close}>{t('done')}</button></div>
  </Modal>;
}

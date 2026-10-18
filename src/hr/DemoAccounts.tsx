import { Check, Users } from 'lucide-react';
import type { DemoAccess, Role } from './types';
import type { Translator } from './i18n';
import './demo-accounts.css';

export default function DemoAccounts({ access, currentRole, busy, t, choose, compact = false }: {
  access: DemoAccess; currentRole?: Role; busy: boolean; t: Translator; choose: (role: Role) => Promise<void>; compact?: boolean;
}) {
  if (!access.enabled) return null;
  return <section className={`hr-demo-switcher ${compact ? 'is-compact' : ''}`} aria-label={t('demoAccounts')}>
    <div className="hr-demo-switcher-title"><Users size={15} /><strong>{t(compact ? 'demoSwitchRole' : 'demoOneClick')}</strong></div>
    {!compact && <p>{t('demoOneClickHint')}</p>}
    <div className="hr-demo-switcher-buttons">{access.roles.map(role => <button type="button" key={role} disabled={busy || role === currentRole} aria-pressed={currentRole ? currentRole === role : undefined} onClick={() => void choose(role)}>
      <span>{t(role)}</span>{currentRole === role ? <Check size={14} /> : !compact && <small>{t('demoEnter')}</small>}
    </button>)}</div>
  </section>;
}

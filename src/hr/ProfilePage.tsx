import { Pencil } from 'lucide-react';
import type { Lang, Person } from './types';
import { formatDate } from './i18n';
import type { Translator } from './i18n';
import './profile.css';

export default function ProfilePage({ person, manager, lang, t, edit }: { person: Person; manager?: string; lang: Lang; t: Translator; edit?: () => void }) {
  const sections = [
    { title: t('profileContacts'), fields: [[t('email'), person.email], [t('phone'), person.phone || t('profileNotProvided')]] },
    { title: t('profileWork'), fields: [[t('company'), person.company], [t('department'), person.department], [t('position'), person.position], [t('lineManager'), manager || t('none')], [t('employeeNumber'), person.employeeNumber || t('profileNotProvided')], [t('hiredAt'), formatDate(person.hiredAt, lang)]] },
  ];
  return <section className="hr-simple-profile">
    <h1>{t('profile')}</h1>
    <div className="hr-simple-profile-sheet">
      <header><span className="hr-simple-profile-avatar" aria-hidden="true">{person.name.split(' ').filter(Boolean).slice(0, 2).map(part => part[0]).join('')}</span><div><h2>{person.name}</h2><p>{t(person.role)}</p></div>{edit && <button className="hr-button secondary" onClick={edit}><Pencil size={16} />{t('editProfile')}</button>}</header>
      {sections.map(section => <section className="hr-profile-section" key={section.title}><h3>{section.title}</h3><dl>{section.fields.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></section>)}
      <p className="hr-simple-profile-note">{t('profileCorrection')}</p>
    </div>
  </section>;
}

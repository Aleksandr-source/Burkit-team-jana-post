import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { ArrowLeft, X } from 'lucide-react';
import type { Translator } from './i18n';

export default function Modal({ title, subtitle, children, close, back, wide = false, t }: { title: string; subtitle?: string; children: ReactNode; close: () => void; back?: () => void; wide?: boolean; t: Translator }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const dialog = dialogRef.current;
    const first = dialog?.querySelector<HTMLElement>('input,button,select,textarea,a[href]');
    first?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') close();
      if (event.key !== 'Tab' || !dialog) return;
      const focusables = [...dialog.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href]')].filter(element => element.offsetParent !== null);
      const start = focusables[0]; const end = focusables.at(-1);
      if (event.shiftKey && document.activeElement === start) { event.preventDefault(); end?.focus(); }
      else if (!event.shiftKey && document.activeElement === end) { event.preventDefault(); start?.focus(); }
    }
    document.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = overflow; document.removeEventListener('keydown', onKey); previous?.focus(); };
  }, [close]);
  return <div className="hr-modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) close(); }}><div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="hr-modal-title" className={`hr-modal ${wide ? 'hr-modal-wide' : ''}`}><header className="hr-modal-header">{back && <button className="hr-icon-button hr-settings-back" onClick={back} aria-label={t('backToSettings')}><ArrowLeft size={20} /></button>}<div><h2 id="hr-modal-title">{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button className="hr-icon-button" onClick={close} aria-label={t('close')}><X size={21} /></button></header><div className="hr-modal-body">{children}</div></div></div>;
}


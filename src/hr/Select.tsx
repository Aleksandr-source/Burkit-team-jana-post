import { Children, isValidElement, useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';
import './select.css';

interface Props {
  value: string | number;
  onChange: (event: { target: { value: string } }) => void;
  children: ReactNode;
  'aria-label': string;
  className?: string;
  disabled?: boolean;
}
interface Option { value: string; label: string; disabled?: boolean; }
function textOf(node: ReactNode): string {
  return Children.toArray(node).map(child => isValidElement<{ children?: ReactNode }>(child) ? textOf(child.props.children) : String(child)).join('');
}
function readOptions(children: ReactNode): Option[] {
  return Children.toArray(children).flatMap(child => {
    if (!isValidElement<{ value?: string | number; children?: ReactNode; disabled?: boolean }>(child)) return [];
    if (child.type !== 'option') return readOptions(child.props.children);
    return [{ value: String(child.props.value ?? ''), label: textOf(child.props.children), disabled: child.props.disabled }];
  });
}

/** A shared, keyboard-accessible select. Focus stays on the combobox while its list is open. */
export default function Select({ value, onChange, children, 'aria-label': label, className = '', disabled }: Props) {
  const options = readOptions(children);
  const selected = options.findIndex(option => option.value === String(value));
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const search = useRef({ text: '', at: 0 });
  const [active, setActive] = useState(Math.max(0, selected));
  const [popup, setPopup] = useState<{ top?: number; bottom?: number; left: number; width: number; maxHeight: number; host: Element } | null>(null);
  function open() {
    const element = trigger.current;
    if (!element || disabled || !options.length) return;
    const rect = element.getBoundingClientRect();
    const below = window.innerHeight - rect.bottom - 12;
    const above = rect.top - 12;
    const flip = below < Math.min(250, options.length * 44 + 12) && above > below;
    const width = Math.min(window.innerWidth - 24, Math.max(rect.width, 180));
    setActive(Math.max(0, selected));
    search.current = { text: '', at: 0 };
    setPopup({ left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)), width, maxHeight: Math.min(300, flip ? above : below), ...(flip ? { bottom: window.innerHeight - rect.top + 6 } : { top: rect.bottom + 6 }), host: element.closest('[role="dialog"]') || element.closest('.hr-app') || document.body });
  }
  function choose(index: number) {
    const option = options[index];
    if (!option || option.disabled) return;
    onChange({ target: { value: option.value } });
    setPopup(null);
    trigger.current?.focus();
  }
  useEffect(() => {
    if (!popup) return;
    function dismiss(event: Event) {
      if (menu.current?.contains(event.target as Node) || trigger.current?.contains(event.target as Node)) return;
      setPopup(null);
    }
    const resize = () => setPopup(null);
    document.addEventListener('pointerdown', dismiss, true);
    document.addEventListener('scroll', dismiss, true);
    window.addEventListener('resize', resize);
    return () => { document.removeEventListener('pointerdown', dismiss, true); document.removeEventListener('scroll', dismiss, true); window.removeEventListener('resize', resize); };
  }, [popup]);
  useEffect(() => { if (popup) menu.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' }); }, [active, popup]);
  function onKey(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === 'Escape' && popup) { event.preventDefault(); event.stopPropagation(); setPopup(null); return; }
    if (event.key === 'Tab') { setPopup(null); return; }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      if (!popup) { open(); return; }
      const enabled = options.map((option, index) => option.disabled ? -1 : index).filter(index => index >= 0);
      const position = enabled.indexOf(active);
      setActive(event.key === 'Home' ? enabled[0] : event.key === 'End' ? enabled.at(-1)! : enabled[(position + (event.key === 'ArrowDown' ? 1 : -1) + enabled.length) % enabled.length]);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (popup) choose(active); else open();
    } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      const now = Date.now();
      search.current = { text: (now - search.current.at < 700 ? search.current.text : '') + event.key.toLocaleLowerCase(), at: now };
      const match = options.findIndex(option => !option.disabled && option.label.toLocaleLowerCase().startsWith(search.current.text));
      if (match >= 0) { if (popup) setActive(match); else choose(match); }
    }
  }
  return <span className={`hr-select ${className}`}>
    <button ref={trigger} type="button" className="hr-select-trigger" role="combobox" aria-label={label} aria-haspopup="listbox" aria-expanded={!!popup} aria-controls={popup ? id : undefined} aria-activedescendant={popup ? `${id}-${active}` : undefined} disabled={disabled} onKeyDown={onKey} onClick={() => popup ? setPopup(null) : open()}><span>{options[selected]?.label || '—'}</span><ChevronDown size={16} aria-hidden="true" /></button>
    {popup && createPortal(<div ref={menu} id={id} role="listbox" aria-label={label} className="hr-select-menu" style={{ position: 'fixed', top: popup.top, bottom: popup.bottom, left: popup.left, width: popup.width, maxHeight: popup.maxHeight }}>
      {options.map((option, index) => <div key={option.value} id={`${id}-${index}`} data-index={index} role="option" aria-selected={selected === index} aria-disabled={option.disabled || undefined} className={`hr-select-option ${active === index ? 'is-active' : ''}`} onPointerMove={() => !option.disabled && setActive(index)} onMouseDown={event => event.preventDefault()} onClick={event => { event.preventDefault(); event.stopPropagation(); choose(index); }}><span>{option.label}</span>{selected === index && <Check size={17} aria-hidden="true" />}</div>)}
    </div>, popup.host)}
  </span>;
}

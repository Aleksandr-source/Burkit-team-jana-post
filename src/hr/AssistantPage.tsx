import { useEffect, useRef, useState } from 'react';
import { ArrowRight, BookOpen, ChevronDown, MessageCircle, Plus, Send, Users } from 'lucide-react';
import { askAssistant } from './api';
import type { AssistantAnswer, Bootstrap, Lang } from './types';
import type { Translator } from './i18n';
import './assistant.css';

interface ChatMessage {
  id: string; role: 'user' | 'assistant'; text: string; result?: AssistantAnswer;
  originalQuestion?: string; questionLanguage?: Lang;
}
interface Props {
  data: Bootstrap; lang: Lang; t: Translator; active: boolean;
  onEscalate: (question: string, language?: Lang) => void;
}

export default function AssistantPage({ data, lang, t, active, onEscalate }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef(false);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const initials = data.user.name.split(' ').filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase();

  useEffect(() => {
    if (!active || !messages.length) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    endRef.current?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'nearest' });
  }, [active, messages, busy]);

  async function send(text = question) {
    const originalQuestion = text.trim();
    if (!originalQuestion || pending.current) return;
    const questionLanguage = lang;
    pending.current = true; setBusy(true); setQuestion(''); setError('');
    setMessages(previous => [...previous.slice(-39), { id: crypto.randomUUID(), role: 'user', text: originalQuestion }]);
    try {
      const result = await askAssistant(originalQuestion, questionLanguage);
      setMessages(previous => [...previous.slice(-39), { id: crypto.randomUUID(), role: 'assistant', text: result.answer, result, originalQuestion, questionLanguage }]);
    } catch (error) {
      setError(error instanceof Error ? error.message : t('networkError'));
      setQuestion(current => current || originalQuestion);
    } finally { pending.current = false; setBusy(false); }
  }

  return <section className="hr-chat-panel hr-chat-focused" aria-label={t('assistant')}>
    <header className="hr-chat-top">
      <span className="hr-jana-orb"><MessageCircle size={20} /></span>
      <div><h1>{t('assistantName')}</h1><span><i className={data.ai.ready ? 'ready' : ''} />{t(data.ai.ready ? 'localAI' : 'knowledgeSearch')}</span></div>
      <button className="hr-button secondary" onClick={() => { setMessages([]); setQuestion(''); setError(''); inputRef.current?.focus(); }} disabled={busy}><Plus size={16} />{t('newChat')}</button>
    </header>
    <div className={`hr-chat-messages ${!messages.length ? 'is-empty' : ''}`}>
      {!messages.length ? <div className="hr-ai-welcome"><h2>{t('chatWelcome')}</h2><div className="hr-quick-questions">{['promptLeave', 'promptApproval', 'promptLearning'].map(key => <button type="button" key={key} onClick={() => void send(t(key))} disabled={busy}><span>{t(key)}</span><ArrowRight size={15} aria-hidden="true" /></button>)}</div></div> : messages.map(message => <div key={message.id} className={`hr-chat-message ${message.role}`}>
        <span className={message.role === 'assistant' ? 'hr-jana-orb' : 'hr-chat-user'}>{message.role === 'assistant' ? <MessageCircle size={16} /> : initials}</span>
        <div className="hr-chat-bubble">
          {message.result && <span className={`hr-answer-mode mode-${message.result.mode}`}>{t(message.result.mode === 'demo_quote' ? 'demoQuote' : message.result.mode === 'local_model' ? 'localAI' : message.result.mode === 'knowledge_search' ? 'knowledgeSearch' : 'refusal')}</span>}
          <p>{message.text}</p>
          {!!message.result?.sources.length && <div className="hr-chat-sources"><strong><BookOpen size={13} />{t('sources')}</strong>{message.result.sources.map((source, index) => <details key={source.id}>
            <summary><span>{index + 1}</span>{source.title}<ChevronDown size={13} /></summary>
            <p className="hr-source-meta">{t('source')}: {source.origin || t('demoSource')}{source.version && <> · {t('version')} {source.version}</>}</p>
            <p>{source.excerpt}</p>
            {source.url && /^\/api\/knowledge\/[\w-]+\?lang=(ru|kk|en)$/.test(source.url) && <p><a href={source.url} target="_blank" rel="noopener noreferrer">{t('openSource')}</a></p>}
          </details>)}</div>}
          {message.result?.mode === 'refusal' && message.originalQuestion && <button className="hr-chat-action hr-escalate-action" onClick={() => onEscalate(message.originalQuestion!, message.questionLanguage)}><Users size={15} />{t('escalateToHr')}<ArrowRight size={14} /></button>}
        </div>
      </div>)}
      {busy && <div className="hr-chat-message assistant"><span className="hr-jana-orb"><MessageCircle size={16} /></span><div className="hr-chat-bubble hr-thinking"><span className="hr-typing-dots" aria-hidden="true"><i /><i /><i /></span><span role="status">{t('thinking')}</span></div></div>}
      <div ref={endRef} />
    </div>
    <div className="hr-chat-bottom">
      {error && <p className="hr-form-error" role="alert">{error}</p>}
      <form className="hr-chat-input" onSubmit={event => { event.preventDefault(); void send(); }}>
        <textarea ref={inputRef} aria-label={t('askPlaceholder')} placeholder={t('askPlaceholder')} maxLength={1200} rows={2} value={question} onChange={event => setQuestion(event.target.value)} onKeyDown={event => {
          if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(); }
        }} />
        <button className="hr-button primary" disabled={!question.trim() || busy} aria-label={t('send')}><Send size={19} /></button>
      </form>
    </div>
  </section>;
}

import { useEffect, useState } from 'react';
import { ArrowRight, FileText, Loader2, RefreshCw } from 'lucide-react';
import type { DocumentProcessingResponse, Lang, LeaveRequest } from './types';
import type { Translator } from './i18n';
import { formatDate } from './i18n';
import { api } from './api';
import Modal from './Modal';
import './document-processing.css';

interface Props {
  requestId: string; request?: LeaveRequest; lang: Lang; t: Translator;
  close: () => void; openRequest: () => void;
}

export default function DocumentProcessingModal({ requestId, request, lang, t, close, openRequest }: Props) {
  const [result, setResult] = useState<DocumentProcessingResponse | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    let pending = false;
    const controller = new AbortController();
    async function load() {
      if (pending) return;
      pending = true; setLoading(true);
      try {
        const response = await api<DocumentProcessingResponse>(`/requests/${encodeURIComponent(requestId)}/document-processing`, { signal: controller.signal });
        if (active) { setResult(response); setError(false); }
      } catch { if (active) setError(true); }
      finally { pending = false; if (active) setLoading(false); }
    }
    void load();
    const timer = window.setInterval(() => { if (window.document.visibilityState === 'visible') void load(); }, 5000);
    return () => { active = false; controller.abort(); window.clearInterval(timer); };
  }, [requestId, revision]);
  const document = result?.document;
  const actions = <div className="hr-document-footer"><button className="hr-button secondary" disabled={loading} onClick={() => setRevision(value => value + 1)}>{loading ? <Loader2 size={16} className="hr-spin" /> : <RefreshCw size={16} />}{t('documentRefresh')}</button>{request && <button className="hr-button primary" onClick={openRequest}>{t('noticeOpenRequest')}<ArrowRight size={16} /></button>}</div>;
  return <Modal title={t('documentProcessingTitle')} subtitle="Documentolog" close={close} t={t} className="hr-document-dialog" footer={actions}>
    <div className="hr-document-processing">
      <p className="hr-document-demo-note">{t('documentDemoNotice')}</p>
      {request && <div className="hr-document-request"><FileText size={20} aria-hidden="true" /><div><strong>{request.employeeName}</strong><span>{formatDate(request.startDate, lang)} — {formatDate(request.endDate, lang)}</span></div></div>}
      <div className="hr-document-status-grid">
        {request && <section><h3>{t('request')}</h3><strong className={`hr-status status-${request.status}`}>{t(request.status)}</strong></section>}
        <section><h3>{t('documentStatusLabel')}</h3><strong className={`hr-document-status status-${document?.status || 'unknown'}`}>{document ? t(`documentStatus_${document.status}`) : result ? t('documentNotRegistered') : t(error ? 'documentUnavailable' : 'connecting')}</strong></section>
      </div>
      <p className="hr-document-independent">{t('documentLeaveIndependent')}</p>
      {error && <p className="hr-form-error" role="alert">{t(result ? 'documentRefreshFailed' : 'documentUnavailable')}</p>}
      {!result && loading && <p className="hr-document-loading" role="status"><Loader2 size={18} className="hr-spin" />{t('connecting')}</p>}
      {result && !document && <p className="hr-document-empty">{t('documentRegistrationHint')}</p>}
      {document && <>
        <section className="hr-document-history"><h3>{t('documentHistory')}</h3><ol>{document.history.map((event, index) => <li key={`${index}-${event.status}`}><span aria-hidden="true" /><div><strong>{t(`documentStatus_${event.status}`)}</strong><time dateTime={event.at}>{formatDate(event.at, lang, true)}</time></div></li>)}</ol></section>
        <div className="hr-document-reference"><span>{t('documentNumber')}</span><code>{document.id}</code></div>
      </>}
    </div>
  </Modal>;
}

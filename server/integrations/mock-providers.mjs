// Internal JanaMen contracts, not a replica of either vendor's HTTP protocol.
// These adapters perform no network IO and never modify HR people/balances.
import { createHash, randomUUID } from 'node:crypto';
import { audit, notify } from '../store.mjs';

const documentEvents = {
  registered: { ru: 'Заявление зарегистрировано', kk: 'Өтініш тіркелді', en: 'Statement registered' },
  in_review: { ru: 'Заявление на рассмотрении', kk: 'Өтініш қаралуда', en: 'Statement under review' },
  completed: { ru: 'Обработка заявления завершена', kk: 'Өтінішті өңдеу аяқталды', en: 'Statement processing completed' },
  rejected: { ru: 'Заявление отклонено в документообороте', kk: 'Өтініш құжат айналымында қабылданбады', en: 'Statement rejected in document processing' },
};
const documentEventBody = {
  ru: 'Documentolog · демонстрация. Решение по отпуску и остаток дней не меняются.',
  kk: 'Documentolog · демонстрация. Демалыс шешімі мен күндер қалдығы өзгермейді.',
  en: 'Documentolog · demonstration. The leave decision and balance are unchanged.',
};

const employees = [
  { externalId: 'MOCK-ZUP-001', employeeNumber: 'MOCK-001', name: 'Демо сотрудник А', department: 'Демо логистика', position: 'Координатор', hiredAt: '2024-03-11', active: true },
  { externalId: 'MOCK-ZUP-002', employeeNumber: 'MOCK-002', name: 'Демо сотрудник Б', department: 'Демо HR', position: 'HR-специалист', hiredAt: '2023-08-01', active: true },
];
const balances = employees.map((person, index) => ({ employeeExternalId: person.externalId,
  employeeNumber: person.employeeNumber, availableDays: index ? 18 : 24, unit: 'calendar_days', asOf: '2026-10-17' }));
const envelope = (provider, data) => ({ schemaVersion: 'janamen.integration.v1', provider, mode: 'mock',
  externalRequestSent: false, ...data });

export function integrationMode(value = 'mock') {
  if (!['mock', 'off'].includes(value)) throw new Error('JANAMEN_INTEGRATIONS_MODE: only mock or off is supported. Live adapters are not installed.');
  return value;
}

export class MockPersonnelProvider {
  employees() { return envelope('1c-zup', { fixture: true, items: structuredClone(employees) }); }
  leaveBalances() { return envelope('1c-zup', { fixture: true, items: structuredClone(balances) }); }
  preview() { return envelope('1c-zup', { fixture: true, dryRun: true, applied: false,
    mappingRequired: true, employees: structuredClone(employees), leaveBalances: structuredClone(balances) }); }
}

export function createMockIntegrations({ db, transaction, mode, fail }) {
  db.exec(`CREATE TABLE IF NOT EXISTS integration_documents (
    id TEXT PRIMARY KEY, requestId TEXT NOT NULL UNIQUE REFERENCES requests(id), data TEXT NOT NULL
  )`);
  const personnel = new MockPersonnelProvider();
  const get = id => {
    const row = db.prepare('SELECT data FROM integration_documents WHERE id=?').get(id);
    if (!row) fail(404, 'not_found', 'Документ не найден.');
    return JSON.parse(row.data);
  };
  return {
    catalog: () => ({ schemaVersion: 'janamen.integration.v1', integrations: [
      { id: '1c-zup', name: '1С:ЗУП', mode, connected: false, capabilities: ['employees.read', 'leave_balances.read', 'sync.preview'] },
      { id: 'documentolog', name: 'Documentolog', mode, connected: false, capabilities: ['documents.register_mock', 'documents.read', 'documents.transition_mock'], electronicSignature: false },
    ] }),
    requireEnabled() { if (mode !== 'mock') fail(503, 'integration_disabled', 'Демонстрационные интеграции отключены.'); },
    personnel,
    document(id) { return envelope('documentolog', { document: get(id) }); },
    register(document, actorId) {
      return transaction(() => {
        const existing = db.prepare('SELECT data FROM integration_documents WHERE requestId=?').get(document.request.id);
        if (existing) return { created: false, ...envelope('documentolog', { document: JSON.parse(existing.data) }) };
        const at = new Date().toISOString();
        const value = { id: `MOCK-DOC-${randomUUID()}`, requestId: document.request.id, status: 'registered',
          signed: false, legallySignificant: false, createdAt: at, updatedAt: at, payload: document,
          payloadSha256: createHash('sha256').update(JSON.stringify(document)).digest('hex'),
          history: [{ status: 'registered', at, actorId, simulated: true }] };
        db.prepare('INSERT INTO integration_documents VALUES (?,?,?)').run(value.id, value.requestId, JSON.stringify(value));
        audit(db, actorId, 'documentolog_mock_registered', value.id);
        notify(db, document.employee.id, 'document_registered', documentEvents.registered, documentEventBody, 'requests', value.requestId);
        return { created: true, ...envelope('documentolog', { document: value }) };
      });
    },
    transition(id, status, actorId) {
      if (!['in_review', 'completed', 'rejected'].includes(status)) fail(400, 'invalid_input', 'Укажите in_review, completed или rejected.');
      return transaction(() => {
        const value = get(id);
        if (value.status === status) return envelope('documentolog', { document: value });
        const next = { registered: ['in_review', 'rejected'], in_review: ['completed', 'rejected'], completed: [], rejected: [] };
        if (!next[value.status].includes(status)) fail(409, 'invalid_transition', 'Этот переход статуса недоступен.');
        value.status = status; value.updatedAt = new Date().toISOString();
        value.history.push({ status, at: value.updatedAt, actorId, simulated: true });
        db.prepare('UPDATE integration_documents SET data=? WHERE id=?').run(JSON.stringify(value), id);
        audit(db, actorId, `documentolog_mock_${status}`, id);
        notify(db, value.payload.employee.id, 'document_status', documentEvents[status], documentEventBody, 'requests', value.requestId);
        return envelope('documentolog', { document: value });
      });
    },
  };
}

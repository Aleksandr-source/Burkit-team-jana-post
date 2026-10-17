// Evaluation-only reader of an actual isolated JanaMen SQLite database. The
// adapter never receives HR write capabilities from this module.
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { visibleEmployee } from './store.mjs';

const actorIds = { employee_a: 'employee', manager_a: 'manager', manager_b: 'manager2', hr: 'hr' };
export function createBusinessStateReader(dataDir) {
  return async ({ actor, kind }) => {
    // The product implements leave. A hypothetical advance workflow is not
    // declared tested merely because a fixture policy describes it.
    if (kind !== 'leave' || !actorIds[actor?.key]) return null;
    const db = new DatabaseSync(join(dataDir, 'asar.sqlite'), { readOnly: true });
    try {
      const user = db.prepare('SELECT * FROM people WHERE id=?').get(actorIds[actor.key]);
      if (!user || user.role !== actor.role) return null;
      const people = db.prepare('SELECT id,email,name,role,company,department,position,managerId,hiredAt,leaveBalance FROM people ORDER BY id').all().filter(person => visibleEmployee(user, person));
      const personIds = new Set(people.map(person => person.id));
      const requests = db.prepare('SELECT * FROM requests ORDER BY id').all().filter(request => personIds.has(request.employeeId));
      const requestIds = new Set(requests.map(request => request.id));
      const profiles = db.prepare('SELECT * FROM person_profiles ORDER BY personId').all().filter(person => personIds.has(person.personId));
      const attachments = db.prepare('SELECT id,requestId,name,size,mimeType,createdBy FROM attachments ORDER BY id').all().filter(file => requestIds.has(file.requestId));
      const documents = db.prepare('SELECT * FROM request_documents ORDER BY requestId').all().filter(document => requestIds.has(document.requestId));
      return { state_sha256: createHash('sha256').update(JSON.stringify({ people, profiles, requests, attachments, documents })).digest('hex') };
    } finally { db.close(); }
  };
}

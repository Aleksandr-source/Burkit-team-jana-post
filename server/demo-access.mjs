import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { companyKey } from './access.mjs';

const roles = ['employee', 'manager', 'hr'];
const loopback = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const localNames = new Set(['localhost', '127.0.0.1', '[::1]']);

export function isLocalDemoRequest(req) {
  if (!loopback.has(req.socket?.remoteAddress)) return false;
  try {
    const host = new URL(`http://${req.headers.host}`);
    if (!localNames.has(host.hostname)) return false;
    if (req.headers['sec-fetch-site'] && !['same-origin', 'none'].includes(req.headers['sec-fetch-site'])) return false;
    if (req.headers.origin) {
      const origin = new URL(req.headers.origin);
      if (!['http:', 'https:'].includes(origin.protocol) || origin.host !== host.host) return false;
    }
    return true;
  } catch { return false; }
}

// Explicitly enabled presentation mode, restricted to seeded fictional
// identities and loopback. Never return credentials or accept an arbitrary ID.
export function createDemoAccess({ db, dataDir, enabled }) {
  function accounts(req) {
    if (!enabled || !isLocalDemoRequest(req) || !existsSync(join(dataDir, 'demo-accounts.txt'))) return [];
    return roles.flatMap(role => {
      const person = db.prepare('SELECT * FROM people WHERE id=? AND email=? AND role=?').get(role, `${role}@janamen.demo`, role);
      return person && companyKey(person.company) === 'jana-post-demo' ? [person] : [];
    });
  }
  return { accounts, catalog(req) { const people = accounts(req); return { enabled: people.length > 0, roles: people.map(person => person.role) }; } };
}

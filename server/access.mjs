// Company is a server-managed boundary. Historic demo labels share one key.
export const DEMO_COMPANY = 'Jana Post · демо';
export function companyKey(value) {
  const key = String(value ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
  return ['jana post · демо', 'jana post · demo'].includes(key) ? 'jana-post-demo' : key;
}
export function sameCompany(first, second) {
  const key = companyKey(first?.company);
  return !!key && key === companyKey(second?.company);
}
export function visibleEmployee(user, employee) {
  return !!user && !!employee && (user.id === employee.id || (sameCompany(user, employee)
    && (user.role === 'hr' || (user.role === 'manager' && employee.managerId === user.id))));
}
// Legacy courses belonged to the original demo company before company scoping.
export function visibleCourse(user, course) {
  return !!course && sameCompany(user, { company: course.company ?? DEMO_COMPANY })
    && (course.published || user.role === 'hr');
}

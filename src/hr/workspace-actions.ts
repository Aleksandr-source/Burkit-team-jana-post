import type { Bootstrap, LeaveRequest, Person } from './types';

export function canReview(request: LeaveRequest, user: Person, people: Person[]) {
  if (request.employeeId === user.id) return false;
  return (request.status === 'pending_hr' && user.role === 'hr')
    || (request.status === 'pending_manager' && ['manager', 'hr'].includes(user.role)
      && people.some(person => person.id === request.employeeId && person.managerId === user.id));
}

export function waitingSince(request: LeaveRequest) {
  return request.status === 'pending_hr'
    ? [...request.history].reverse().find(item => item.action === 'manager_approved')?.at || request.updatedAt
    : request.createdAt;
}

export function workspaceActions(data: Bootstrap) {
  if (!['manager', 'hr'].includes(data.user.role)) return { requests: [], inquiries: [], learning: [] };
  const requests = data.requests.filter(request => canReview(request, data.user, data.people))
    .sort((a, b) => waitingSince(a).localeCompare(waitingSince(b)));
  const inquiries = data.user.role === 'hr' ? data.hrInquiries
    .filter(inquiry => inquiry.status === 'open' && inquiry.authorId !== data.user.id)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt)) : [];
  const learning = data.courses.map(course => {
    const enrollments = data.enrollments.filter(enrollment => enrollment.courseId === course.id && enrollment.userId !== data.user.id);
    return { course, enrollments, completed: enrollments.filter(enrollment => enrollment.passed).length };
  }).filter(item => item.enrollments.length > 0);
  return { requests, inquiries, learning };
}

export type Lang = 'ru' | 'kk' | 'en';
export type Localized = Record<Lang, string>;
export type Role = 'employee' | 'manager' | 'hr';
export type View = 'home' | 'requests' | 'team' | 'academy' | 'assistant' | 'notifications' | 'people';
export interface Person { id: string; name: string; email: string; role: Role; company: string; department: string; position: string; managerId: string | null; managerName?: string | null; hiredAt: string; leaveBalance: number; leaveReserved: number; }
export interface HistoryEntry { id: string; actorName: string; action: string; comment: string; at: string; }
export interface Attachment { id: string; name: string; size: number; mimeType: string; }
export type RequestStatus = 'pending_manager' | 'pending_hr' | 'approved' | 'rejected' | 'cancelled';
export interface LeaveRequest { id: string; employeeId: string; employeeName: string; department: string; startDate: string; endDate: string; days: number; reason: string; status: RequestStatus; createdAt: string; updatedAt: string; history: HistoryEntry[]; attachments: Attachment[]; }
export interface Lesson { id: string; title: Localized; content: Localized; resourceUrl?: string; }
export interface QuizQuestion { id: string; prompt: Localized; options: Localized[]; correctIndex?: number; }
export interface Course { id: string; title: Localized; description: Localized; category: string; durationMinutes: number; published: boolean; lessons: Lesson[]; quiz: QuizQuestion[]; passScore: number; createdAt: string; updatedAt: string; cover: string; }
export interface Enrollment { id: string; userId: string; userName: string; courseId: string; completedLessonIds: string[]; score: number | null; passed: boolean; completedAt: string | null; assignedAt: string; }
export interface Notification { id: string; type: string; title: Localized; body: Localized; readAt: string | null; createdAt: string; view: View; entityId?: string; }
export interface KnowledgeDocument { id: string; title: Localized; content: Localized; section: string; version: string; audience: 'all' | 'manager' | 'hr'; }
export interface AIStatus { ready: boolean; engine: string; model: string; }
export interface Bootstrap { user: Person; people: Person[]; requests: LeaveRequest[]; courses: Course[]; enrollments: Enrollment[]; notifications: Notification[]; knowledge: KnowledgeDocument[]; ai: AIStatus; }
export interface AssistantAnswer { answer: string; sources: { id: string; title: string; excerpt: string }[]; mode: 'local_model' | 'knowledge_search' | 'refusal'; }

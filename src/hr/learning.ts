import type { Course, Enrollment } from './types';

export const courseProgress = (course: Course, enrollment?: Enrollment) => enrollment?.passed ? 100 : course.lessons.length
  ? Math.round(course.lessons.filter(lesson => enrollment?.completedLessonIds.includes(lesson.id)).length / (course.lessons.length + 1) * 100) : 0;

export function quizDraftKey(userId: string, course: Course) {
  return `janamen.quiz.${userId}.${course.id}.${course.updatedAt}`;
}

export function readQuizDraft(raw: string | null, course: Course): number[] {
  try {
    const value: unknown = JSON.parse(raw || 'null');
    if (!Array.isArray(value)) return [];
    const answers: number[] = [];
    course.quiz.forEach((question, index) => {
      const choice = value[index];
      if (Number.isInteger(choice) && choice >= 0 && choice < question.options.length) answers[index] = choice;
    });
    return answers;
  } catch { return []; }
}

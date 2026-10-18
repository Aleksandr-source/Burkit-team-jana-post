import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowUpRight, Check, CheckCircle2, GraduationCap, Loader2, RotateCcw } from 'lucide-react';
import type { Bootstrap, Course, Lang } from './types';
import { localized, formatDate } from './i18n';
import type { Translator } from './i18n';
import { courseProgress, quizDraftKey, readQuizDraft } from './learning';
import Modal from './Modal';
import './learning.css';

interface QuizResult { score: number; passed: boolean; bestScore: number; feedback: { id: string; correct: boolean }[]; }
interface Props {
  data: Bootstrap; course: Course; lang: Lang; t: Translator; close: () => void;
  mutate: <T = unknown>(path: string, body?: unknown, message?: string) => Promise<T>;
}

export default function CourseDetail({ data, course, lang, t, mutate, close }: Props) {
  const enrollment = data.enrollments.find(item => item.userId === data.user.id && item.courseId === course.id);
  const [selected, setSelected] = useState(() => {
    if (!enrollment || enrollment.passed) return 0;
    const next = course.lessons.findIndex(lesson => !enrollment.completedLessonIds.includes(lesson.id));
    return next < 0 ? course.lessons.length : next;
  });
  const draftKey = quizDraftKey(data.user.id, course);
  const [answers, setAnswers] = useState<number[]>(() => {
    try { return readQuizDraft(sessionStorage.getItem(draftKey), course); } catch { return []; }
  });
  const [result, setResult] = useState<QuizResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const heading = useRef<HTMLHeadingElement>(null);
  const lesson = course.lessons[selected];
  const finishedLessons = !!enrollment && course.lessons.every(item => enrollment.completedLessonIds.includes(item.id));
  const answered = course.quiz.filter((_, index) => Number.isInteger(answers[index])).length;
  const progress = courseProgress(course, enrollment);
  useEffect(() => {
    // Drafts are per-account, per-course revision and stay in this browser tab.
    // A disabled/full session store must never prevent learning.
    try {
      if (enrollment?.passed || result) sessionStorage.removeItem(draftKey);
      else sessionStorage.setItem(draftKey, JSON.stringify(answers));
    } catch { /* Storage is optional. */ }
  }, [answers, draftKey, enrollment?.passed, result]);
  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, [selected]);

  async function complete() {
    if (!lesson || busy) return;
    setBusy(true); setError('');
    try {
      await mutate(`/courses/${course.id}/lessons/${lesson.id}/complete`, {});
      setSelected(Math.min(selected + 1, course.lessons.length));
    } catch (error) { setError(error instanceof Error ? error.message : t('networkError')); }
    finally { setBusy(false); }
  }
  async function submitQuiz(event: FormEvent) {
    event.preventDefault();
    if (busy || answered !== course.quiz.length) return;
    setBusy(true); setError('');
    try { setResult(await mutate<QuizResult>(`/courses/${course.id}/quiz`, { answers })); }
    catch (error) { setError(error instanceof Error ? error.message : t('networkError')); }
    finally { setBusy(false); }
  }

  return <Modal title={localized(course.title, lang)} subtitle={`${course.category} · ${course.durationMinutes} ${t('minutes')}`} close={close} t={t} wide>
    <div className="hr-course-detail">
      <nav className="hr-lesson-list" aria-label={t('courseContents')}>
        {course.lessons.map((item, index) => <button key={item.id} className={selected === index ? 'active' : ''} aria-current={selected === index ? 'step' : undefined} disabled={busy} onClick={() => setSelected(index)}>
          <span className={enrollment?.completedLessonIds.includes(item.id) ? 'done' : ''}>{enrollment?.completedLessonIds.includes(item.id) ? <Check size={14} /> : index + 1}</span>
          <span>{localized(item.title, lang)}</span>
        </button>)}
        <button className={selected === course.lessons.length ? 'active' : ''} aria-current={!lesson ? 'step' : undefined} disabled={busy} onClick={() => setSelected(course.lessons.length)}><span><GraduationCap size={15} /></span><span>{t('quiz')}</span></button>
        <div className="hr-lesson-progress"><span>{t('progress')}<strong>{progress}%</strong></span><div className="hr-progress" role="progressbar" aria-label={t('progress')} aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${progress}%` }} /></div></div>
      </nav>
      <div className="hr-lesson-main" aria-busy={busy}>
        {lesson ? <>
          <span className="hr-eyebrow">{t('lesson')} {selected + 1} / {course.lessons.length}</span>
          <h3 ref={heading} tabIndex={-1}>{localized(lesson.title, lang)}</h3>
          <div className="hr-lesson-content">{localized(lesson.content, lang).split(/\n\n+/).map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div>
          {lesson.resourceUrl && /^https:\/\//i.test(lesson.resourceUrl) && <a className="hr-text-link hr-resource-link" href={lesson.resourceUrl} target="_blank" rel="noreferrer">{t('material')}<ArrowUpRight size={15} /></a>}
          {enrollment ? <button className="hr-button primary" onClick={complete} disabled={busy}>{busy ? <Loader2 size={16} className="hr-spin" /> : <Check size={17} />}{enrollment.completedLessonIds.includes(lesson.id) ? t('continueLearning') : t('completeLesson')}</button>
            : <p className="hr-info-note">{t('notAssigned')}. {t('noCoursesText')}</p>}
        </> : <>
          <span className="hr-eyebrow">JANA ACADEMY</span><h3 ref={heading} tabIndex={-1}>{t('quiz')}</h3>
          <p className="hr-quiz-criteria">{t('requiredScore')}: <strong>{course.passScore}%</strong> · {t('questionsCount')}: {course.quiz.length}</p>
          {enrollment?.passed ? <>
            <div role="status" className="hr-quiz-result passed"><CheckCircle2 size={28} /><div><strong>{t('quizPassed')}</strong><p>{t('bestScore')}: {enrollment.score}%{enrollment.completedAt ? ` · ${formatDate(enrollment.completedAt, lang)}` : ''}</p></div></div>
            <button className="hr-button secondary" onClick={() => setSelected(0)}>{t('reviewLessons')}</button>
          </> : !finishedLessons ? <p className="hr-info-note">{t('quizIntro')}</p> : <form onSubmit={submitQuiz} className="hr-quiz-form">
            <p className="hr-quiz-draft-note">{t('quizDraftHint')}</p>
            {course.quiz.map((question, index) => {
              const feedback = result?.feedback?.find(item => item.id === question.id);
              return <fieldset key={question.id} disabled={busy} className={feedback ? feedback.correct ? 'hr-question-correct' : 'hr-question-review' : ''}>
                <legend>{index + 1}. {localized(question.prompt, lang)}</legend>
                {question.options.map((option, optionIndex) => <label key={optionIndex} className={`hr-quiz-option ${answers[index] === optionIndex ? 'selected' : ''}`}>
                  <input type="radio" required name={`question-${question.id}`} checked={answers[index] === optionIndex} onChange={() => { const next = [...answers]; next[index] = optionIndex; setAnswers(next); setResult(null); }} />{localized(option, lang)}
                </label>)}
                {feedback && <p className="hr-question-feedback">{feedback.correct ? t('answerCorrect') : t('answerReview')}</p>}
              </fieldset>;
            })}
            {result && <div role="status" className={`hr-quiz-result ${result.passed ? 'passed' : 'failed'}`}><RotateCcw size={26} /><div><strong>{result.passed ? t('quizPassed') : t('quizRetry')}</strong><p>{t('score')}: {result.score}% · {t('requiredScore')}: {course.passScore}%</p></div></div>}
            {result && !result.passed && <button type="button" className="hr-button secondary" onClick={() => setSelected(0)}>{t('reviewLessons')}</button>}
            <div className="hr-quiz-submit"><span role="status">{t('answeredQuestions')}: {answered} / {course.quiz.length}</span><button className="hr-button primary" disabled={busy || answered !== course.quiz.length}>{busy && <Loader2 size={16} className="hr-spin" />}{t('submitQuiz')}</button></div>
          </form>}
        </>}
        {error && <p className="hr-form-error" role="alert">{error}</p>}
      </div>
    </div>
  </Modal>;
}

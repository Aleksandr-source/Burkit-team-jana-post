import { fail } from './errors.mjs';
export const required = (value, max = 500, label = 'Поле') => {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max)
    fail(400, 'invalid_input', `${label}: заполните корректное значение (до ${max} символов).`);
  return value.trim();
};
export const dateValue = value => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    fail(400, 'invalid_date', 'Укажите корректную дату.');
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value)
    fail(400, 'invalid_date', 'Такой календарной даты не существует.');
  return date;
};
export function today() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Almaty', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date());
  return ['year', 'month', 'day'].map(t => parts.find(p => p.type === t).value).join('-');
}

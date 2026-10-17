import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merges Tailwind classes with clsx logic
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

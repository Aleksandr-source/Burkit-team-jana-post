import React from 'react';
import { Sun, Moon } from 'lucide-react';
import { useTheme } from '../lib/ThemeContext';
import { cn } from '../lib/utils';

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="flex items-center gap-1 p-1 bg-gray-100 dark:bg-white/10 rounded-full h-[36px] transition-all duration-200">
      <button
        onClick={() => setTheme('light')}
        className={cn(
          "w-7 h-7 flex items-center justify-center rounded-full transition-all duration-200",
          theme === 'light' 
            ? "bg-white shadow-md text-yellow-500 dark:text-yellow-400" 
            : "opacity-60 text-gray-500 hover:bg-gray-200 dark:hover:bg-white/20 hover:scale-105"
        )}
        aria-label="Light"
      >
        <Sun className="w-4 h-4" />
      </button>
      <button
        onClick={() => setTheme('dark')}
        className={cn(
          "w-7 h-7 flex items-center justify-center rounded-full transition-all duration-200",
          theme === 'dark' 
            ? "bg-[#1e293b] shadow-md text-blue-400" 
            : "opacity-60 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-white/20 hover:scale-105"
        )}
        aria-label="Dark"
      >
        <Moon className="w-4 h-4" />
      </button>
    </div>
  );
}

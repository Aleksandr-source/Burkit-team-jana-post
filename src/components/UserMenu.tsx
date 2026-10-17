import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { LogOut, ChevronDown, Languages, Check, Moon, Sun } from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../lib/ThemeContext';

export function UserMenu() {
  const { user, displayName, logout } = useAuth();
  const { t, i18n } = useTranslation();
  const { theme, setTheme } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = async () => {
    console.log("logout");
    setIsOpen(false);
    await logout();
  };

  const languages = [
    { code: 'ru', label: 'Русский (RU)' },
    { code: 'en', label: 'English (EN)' },
    { code: 'kk', label: 'Қазақ тілі (KK)' },
  ];

  const currentLang = i18n.language.split('-')[0];

  const handleLanguageChange = (lang: string) => {
    i18n.changeLanguage(lang);
    setIsOpen(false);
  };

  return (
    <>
      <div className="relative z-[100]" ref={menuRef}>
        <div 
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-2 px-2.5 h-8 border border-border rounded-full bg-card shadow-sm cursor-pointer hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
        >
          <div className="w-5 h-5 bg-brand-accent rounded-full flex items-center justify-center text-white text-[10px] font-bold overflow-hidden shrink-0">
            {user?.photoURL ? (
              <img src={user.photoURL} alt={displayName || 'User'} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
            ) : (
              displayName?.[0]?.toUpperCase() || 'U'
            )}
          </div>
          <span className="text-[11px] font-bold text-foreground truncate max-w-[80px] hidden xs:block">
            {displayName}
          </span>
          <ChevronDown className="w-3 h-3 text-muted-foreground hidden xs:block" />
        </div>

        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ opacity: 0, y: 5, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 5, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              className="user-menu-dropdown absolute right-0 top-[calc(100%+8px)] w-56 dropdown border border-border rounded-xl shadow-2xl p-1 z-[9999] origin-top-right overflow-hidden flex flex-col"
            >
              {/* Account details */}
              <div className="px-3 py-2 border-b border-border mb-1">
                <p className="text-[12px] font-bold text-foreground truncate">{displayName}</p>
                <p className="text-[10px] text-muted-foreground truncate">{user?.email}</p>
              </div>

              <div className="py-1">
                <div className="px-3 py-2 flex items-center justify-between">
                  <span className="text-[13px] text-muted-foreground font-medium">{t('settings.tabs.theme.title', { defaultValue: 'Тема' })}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setTheme(theme === 'dark' ? 'light' : 'dark');
                    }}
                    className="w-9 h-9 flex items-center justify-center rounded-full bg-black/5 hover:bg-black/10 dark:bg-white/10 dark:hover:bg-white/20 border border-black/5 dark:border-white/10 transition-all duration-300 hover:scale-110"
                  >
                    {theme === 'dark' ? (
                      <Sun className="w-4 h-4 text-yellow-400 transition-transform duration-300" />
                    ) : (
                      <Moon className="w-4 h-4 text-blue-400 transition-transform duration-300" />
                    )}
                  </button>
                </div>
              </div>

              <div className="my-1 border-t border-border" />

              <div className="py-1">
                <div className="px-3 py-1.5 flex items-center gap-2 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                  <Languages className="w-3 h-3" />
                  <span>{t('settings.tabs.language.title', { defaultValue: 'Язык' })}</span>
                </div>
                {languages.map((lang) => {
                  const isActive = currentLang === lang.code;
                  return (
                    <button
                      key={lang.code}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleLanguageChange(lang.code);
                      }}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-[12px] font-medium transition-all outline-none mb-0.5 ${
                        isActive 
                          ? 'bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400 font-bold' 
                          : 'text-foreground hover:bg-gray-100 dark:hover:bg-white/5'
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        {lang.label}
                      </span>
                      {isActive && <Check className="w-3.5 h-3.5 stroke-[3px]" />}
                    </button>
                  );
                })}
              </div>

              <div className="my-1 border-t border-border" />

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleLogout();
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[12px] font-medium text-red-500 hover:bg-red-500/10 transition-colors outline-none"
              >
                <LogOut className="w-4 h-4" />
                <span>{t('common.logout', { defaultValue: 'Выйти' })}</span>
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}

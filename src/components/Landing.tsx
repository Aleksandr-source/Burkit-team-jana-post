import React from 'react';
import { useAuth } from '../lib/AuthContext';
import { motion } from 'motion/react';
import { Map as RouteIcon, ArrowRight, LayoutGrid, CheckSquare, CalendarDays, Languages, Moon, Sun } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../lib/ThemeContext';

export function Landing() {
  const { login } = useAuth();
  const { t, i18n } = useTranslation();
  const { theme, setTheme } = useTheme();

  const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  const toggleLanguage = () => {
    const langs = ['ru', 'en', 'kk'];
    const currentBase = i18n.language.split('-')[0];
    const currentIndex = langs.indexOf(currentBase);
    const nextLang = langs[(currentIndex + 1) % langs.length];
    i18n.changeLanguage(nextLang);
  };

  return (
    <div className={`flex min-h-screen items-stretch overflow-hidden transition-colors duration-700 relative text-foreground ${isDark ? 'bg-gradient-to-br from-[#020617] via-[#020617] to-[#0f172a]' : 'bg-[linear-gradient(135deg,#EEF2FF_0%,#F8FAFF_50%,#F6F8FB_100%)]'}`}>
      
      {/* BACKGROUND FLOATING ELEMENTS */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {isDark && <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px] z-0" />}
        {/* Central Glow */}
        <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] pointer-events-none blur-[40px] z-0 ${isDark ? 'bg-[radial-gradient(circle,rgba(99,139,255,0.1),transparent_60%)]' : 'bg-[radial-gradient(circle,rgba(79,124,255,0.15),transparent_60%)]'}`} />
        
        {/* Connecting beam */}
        <div className={`absolute top-1/2 left-[30%] w-[40%] h-[120px] -translate-y-1/2 rotate-[-15deg] pointer-events-none blur-[20px] ${isDark ? 'bg-[radial-gradient(ellipse_at_center,rgba(99,139,255,0.05),transparent_70%)]' : 'bg-[radial-gradient(ellipse_at_center,rgba(79,124,255,0.1),transparent_70%)]'}`} />

        {/* Soft Blurred Gradients */}
        <motion.div 
          animate={{ y: [0, -20, 0], x: [0, 10, 0] }}
          transition={{ duration: 15, repeat: Infinity, ease: "easeInOut" }}
          className={`absolute top-[-5%] left-[-5%] w-[500px] h-[500px] rounded-full opacity-15 blur-[100px] ${isDark ? 'bg-indigo-600' : 'bg-blue-400'}`}
        />
        <motion.div 
          animate={{ y: [0, 20, 0], x: [0, -10, 0] }}
          transition={{ duration: 20, repeat: Infinity, ease: "easeInOut", delay: 2 }}
          className={`absolute bottom-[-10%] right-[-5%] w-[600px] h-[600px] rounded-full opacity-10 blur-[120px] ${isDark ? 'bg-purple-600' : 'bg-indigo-400'}`}
        />
        <motion.div 
          animate={{ y: [0, 15, 0], x: [0, 15, 0] }}
          transition={{ duration: 18, repeat: Infinity, ease: "easeInOut", delay: 4 }}
          className={`absolute top-[40%] left-[40%] w-[400px] h-[400px] rounded-full opacity-[0.12] blur-[100px] ${isDark ? 'bg-blue-600' : 'bg-purple-400'}`}
        />

        {/* Floating Outline Icons */}
        <motion.div 
          animate={{ y: [-10, 10, -10] }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
          className={`absolute top-[20%] right-[15%] ${isDark ? 'text-blue-400' : 'text-blue-500'} opacity-10`}
        >
          <CalendarDays className="w-10 h-10" strokeWidth={1} />
        </motion.div>
        
        <motion.div 
          animate={{ y: [10, -10, 10] }}
          transition={{ duration: 7, repeat: Infinity, ease: "easeInOut", delay: 1 }}
          className={`absolute bottom-[20%] left-[10%] ${isDark ? 'text-blue-400' : 'text-blue-500'} opacity-[0.08]`}
        >
          <CheckSquare className="w-12 h-12" strokeWidth={1} />
        </motion.div>

        <motion.div 
          animate={{ y: [-8, 8, -8] }}
          transition={{ duration: 9, repeat: Infinity, ease: "easeInOut", delay: 2 }}
          className={`absolute top-[65%] right-[10%] ${isDark ? 'text-blue-400' : 'text-blue-500'} opacity-10`}
        >
          <LayoutGrid className="w-8 h-8" strokeWidth={1} />
        </motion.div>
        
        <motion.div 
          animate={{ y: [12, -12, 12] }}
          transition={{ duration: 10, repeat: Infinity, ease: "easeInOut", delay: 3 }}
          className={`absolute top-[15%] left-[15%] ${isDark ? 'text-blue-400' : 'text-blue-500'} opacity-[0.12]`}
        >
          <RouteIcon className="w-10 h-10" strokeWidth={1} />
        </motion.div>
      </div>

      {/* Language Toggle Floating */}
      <div className="fixed top-6 right-6 z-50 flex items-center gap-2">
        <button 
          onClick={() => setTheme(isDark ? 'light' : 'dark')}
          className="flex items-center justify-center w-10 h-10 bg-black/5 hover:bg-black/10 dark:bg-white/10 dark:hover:bg-white/20 backdrop-blur-md border border-black/10 dark:border-white/20 rounded-xl transition-all shadow-sm text-foreground"
          title={isDark ? "Светлая тема" : "Тёмная тема"}
        >
          {isDark ? <Sun className="w-5 h-5 text-amber-500" /> : <Moon className="w-5 h-5 text-indigo-500" />}
        </button>
        <button 
          onClick={toggleLanguage}
          className="flex items-center gap-2 px-3 py-2 h-10 bg-black/5 hover:bg-black/10 dark:bg-white/10 dark:hover:bg-white/20 backdrop-blur-md border border-black/10 dark:border-white/20 rounded-xl transition-all shadow-sm text-[12px] font-bold text-foreground uppercase"
        >
          <Languages className="w-4 h-4 text-[#4F7CFF]" />
          {i18n.language.split('-')[0]}
        </button>
      </div>

      {/* LEFT SIDE (60%) */}
      <div className="hidden lg:flex w-[60%] relative flex-col justify-center px-20 border-r border-[#E6EAF0]/50 z-10">
        
        {/* Content */}
        <div className="relative w-full max-w-2xl">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="mb-14 relative z-10"
          >
            <h1 
              className={`text-[52px] ${isDark ? 'font-[700] bg-gradient-to-r from-white to-white/70 bg-clip-text text-transparent' : 'font-bold text-foreground'} leading-[1.15] mb-6 tracking-[-0.02em] max-w-[480px]`}
              style={isDark ? { textShadow: '0 0 20px rgba(255,255,255,0.08)' } : undefined}
            >
              {t('landing.title')}
            </h1>
            <p className="text-[18px] text-muted-foreground max-w-[480px] leading-relaxed font-medium">
              {t('landing.subtitle')}
            </p>
          </motion.div>

          {/* FEATURE PREVIEW SCENE - LAYERED CARDS */}
          <motion.div 
            animate={{ y: [0, -12, 0] }}
            transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
            className="relative h-[340px] w-full mt-10 scale-[1.25] origin-left translate-x-[20px]"
          >
            {/* Back Card */}
            <motion.div 
              initial={{ opacity: 0, x: -30, rotate: -8 }}
              animate={{ opacity: 0.95, x: 0, rotate: -6 }}
              transition={{ duration: 0.8, delay: 0.2 }}
              className="absolute left-[30px] top-[40px] w-[260px] h-[180px] bg-card/80 backdrop-blur-md rounded-[16px] border border-border p-5 shadow-lg z-0"
            >
              <div className="h-2 w-1/3 bg-[#E6EAF0] rounded-full mb-4" />
              <div className="space-y-3">
                <div className="h-10 w-full bg-[#F3F4F6]/60 rounded-xl" />
                <div className="h-10 w-4/5 bg-[#F3F4F6]/60 rounded-xl" />
              </div>
            </motion.div>

            {/* Middle Card */}
            <motion.div 
              initial={{ opacity: 0, x: 40, rotate: 6 }}
              animate={{ opacity: 1, x: 0, rotate: 4 }}
              transition={{ duration: 0.8, delay: 0.4 }}
              className="absolute left-[170px] top-[60px] w-[280px] h-[190px] bg-card/95 backdrop-blur-md rounded-[16px] border border-border p-5 shadow-xl z-10"
            >
              <div className="flex items-center gap-3 mb-5">
                <div className="w-8 h-8 rounded-full bg-[#EEF2FF] flex items-center justify-center">
                   <CalendarDays className="w-4 h-4 text-[#4F7CFF]" />
                </div>
                <div className="h-2.5 w-24 bg-[#E6EAF0] rounded-full" />
              </div>
              <div className="space-y-3">
                <div className="h-2 w-full bg-[#F3F4F6] rounded-full" />
                <div className="h-2 w-5/6 bg-[#F3F4F6] rounded-full" />
                <div className="h-2 w-2/3 bg-[#F3F4F6] rounded-full" />
              </div>
            </motion.div>

            {/* Front Card (Main Focus) */}
            <motion.div 
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0, rotate: -2 }}
              transition={{ duration: 0.8, delay: 0.6 }}
              className="absolute left-[80px] top-[120px] w-[320px] bg-card rounded-[16px] border border-border p-6 shadow-[0_20px_50px_rgba(79,124,255,0.18)] z-20"
            >
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-3">
                   <CheckSquare className="w-5 h-5 text-[#4F7CFF]" />
                   <div className="h-2.5 w-20 bg-[#1F2937]/80 rounded-full" />
                </div>
                <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center">
                  <div className="w-3 h-3 bg-emerald-500 rounded-full" />
                </div>
              </div>
              <div className="h-2 w-full bg-[#E6EAF0] rounded-full mb-2.5" />
              <div className="h-2 w-3/4 bg-[#E6EAF0] rounded-full mb-6" />
              
              <div className="flex justify-between items-center pt-4 border-t border-[#F3F4F6]">
                <div className="flex -space-x-2">
                  <div className="w-7 h-7 rounded-full bg-[#EEF2FF] border-2 border-background flex items-center justify-center">
                    <div className="w-4 h-4 bg-[#4F7CFF]/50 rounded-full" />
                  </div>
                  <div className="w-7 h-7 rounded-full bg-[#F3F4F6] border-2 border-background flex items-center justify-center">
                    <div className="w-4 h-4 bg-[#9CA3AF]/50 rounded-full" />
                  </div>
                  <div className="w-7 h-7 rounded-full bg-[#EEF2FF] border-2 border-background flex items-center justify-center text-[10px] font-bold text-[#4F7CFF]">
                    +2
                  </div>
                </div>
                <div className="h-6 px-3 rounded-full bg-[#EEF2FF] flex items-center justify-center">
                  <span className="text-[11px] font-semibold text-[#4F7CFF]">{t('landing.inProgress')}</span>
                </div>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </div>

      {/* RIGHT SIDE (40% Desktop, 100% Mobile) */}
      <div className="w-full lg:w-[40%] flex flex-col items-center justify-center p-6 relative z-10">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1.05 }}
          transition={{ duration: 0.8, ease: "easeOut", delay: 0.1 }}
          className="w-full max-w-[420px] bg-card/60 dark:bg-card/5 backdrop-blur-xl rounded-[20px] shadow-2xl p-[32px] relative z-20 border border-border before:absolute before:-inset-[20px] before:bg-[radial-gradient(circle,rgba(79,124,255,0.15),transparent_70%)] before:rounded-[40px] before:-z-10"
        >
          {/* Logo Concept */}
          <div className="flex justify-center mb-6">
            <div className="w-[72px] h-[72px] bg-gradient-to-br from-[#4F7CFF] to-[#6A8BFF] rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/30">
              <RouteIcon className="w-9 h-9 text-white" strokeWidth={2.5} />
            </div>
          </div>

          <div className="text-center mb-8">
            <h2 className="text-[22px] font-bold text-foreground mb-1">
              Asar
            </h2>
            <p className="text-[14px] text-muted-foreground">
              {t('landing.nextLevel')}
            </p>
          </div>

          <button
            onClick={login}
            className="group relative w-full h-[52px] bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 text-white font-medium text-[15px] rounded-[14px] flex items-center justify-center gap-3 transition-all duration-200 shadow-lg shadow-blue-500/20 cursor-pointer hover:scale-[1.02] active:scale-[0.98]"
          >
            {/* Simple Google SVG icon */}
            <div className="w-[28px] h-[28px] bg-white rounded-full flex items-center justify-center p-1.5 shrink-0 shadow-sm">
              <svg className="w-full h-full" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
            </div>
            {t('landing.loginGoogle')}
            <ArrowRight className="w-5 h-5 absolute right-4 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all text-white/90" />
          </button>
          
          <p className="mt-8 text-center text-[12px] text-muted-foreground leading-relaxed">
            {t('landing.terms')}
          </p>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, delay: 0.8 }}
          className="absolute bottom-8 left-0 right-0 text-center z-10"
        >
          <p className="text-[12px] font-medium text-muted-foreground">
            {t('landing.footer')}
          </p>
        </motion.div>
      </div>
    </div>
  );
}


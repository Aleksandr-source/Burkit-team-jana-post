import React, { useMemo, useEffect } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { motion, useMotionValue, useSpring, useTransform } from 'motion/react';
import { Workflow, CheckCircle2, LayoutGrid, Users, Zap, Target } from 'lucide-react';
import { useTheme } from '../lib/ThemeContext';

export function DynamicBackground() {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { theme } = useTheme();

  const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  
  const viewType = searchParams.get('view');
  
  const pageType = useMemo(() => {
    if (location.pathname === '/' || location.pathname === '/landing') return 'dashboard';
    if (location.pathname.startsWith('/project/')) {
      if (viewType === 'map') return 'roadmap';
      return 'kanban';
    }
    if (location.pathname.startsWith('/settings')) return 'settings';
    return 'dashboard';
  }, [location.pathname, viewType]);

  const isDashboard = pageType === 'dashboard';
  const isKanban = pageType === 'kanban';
  const isRoadmap = pageType === 'roadmap';
  const isSettings = pageType === 'settings';

  // Mouse Parallax Trackers
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  const smoothX = useSpring(mouseX, { damping: 50, stiffness: 400 });
  const smoothY = useSpring(mouseY, { damping: 50, stiffness: 400 });

  const midLayerX = useTransform(smoothX, (v) => v * -3);
  const midLayerY = useTransform(smoothY, (v) => v * -3);

  const nearLayerX = useTransform(smoothX, (v) => v * -8);
  const nearLayerY = useTransform(smoothY, (v) => v * -8);

  const glowX = useTransform(smoothX, (v) => v * -5);
  const glowY = useTransform(smoothY, (v) => v * -5);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      // Normalize to -1 -> 1 range
      const x = (e.clientX / window.innerWidth) * 2 - 1;
      const y = (e.clientY / window.innerHeight) * 2 - 1;
      mouseX.set(x);
      mouseY.set(y);
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, [mouseX, mouseY]);

  return (
    <div className={`fixed inset-0 z-[-1] pointer-events-none overflow-hidden transition-colors duration-700 ${isDark ? 'bg-[#0a0f1c]' : 'bg-[#F6F8FB]'}`}>
      {/* 1. Base Gradient with slow shift */}
      <motion.div 
        className="absolute inset-0"
        style={{
          background: isDark 
            ? 'radial-gradient(circle at 50% 50%, #1e293b 0%, #0f172a 40%, #020617 100%)'
            : 'radial-gradient(circle at 50% 50%, #EEF2FF 0%, #F6F8FB 40%, #FFFFFF 100%)'
        }}
        animate={{
          background: isDark 
            ? (isKanban ? 
                'radial-gradient(circle at 50% 50%, #1e293b 0%, #0f172a 40%, #020617 100%)' :
                [
                  'radial-gradient(circle at 50% 50%, #1e293b 0%, #0f172a 40%, #020617 100%)',
                  'radial-gradient(circle at 50% 50%, #0f172a 0%, #020617 50%, #020617 100%)',
                  'radial-gradient(circle at 50% 50%, #1e293b 0%, #0f172a 40%, #020617 100%)'
                ])
            : (isKanban ? 
                'radial-gradient(circle at 50% 50%, #EEF2FF 0%, #F6F8FB 40%, #FFFFFF 100%)' :
                [
                  'radial-gradient(circle at 50% 50%, #EEF2FF 0%, #F6F8FB 40%, #FFFFFF 100%)',
                  'radial-gradient(circle at 50% 50%, #F6F8FB 0%, #FFFFFF 50%, #EEF2FF 100%)',
                  'radial-gradient(circle at 50% 50%, #EEF2FF 0%, #F6F8FB 40%, #FFFFFF 100%)'
                ])
        }}
        transition={{ duration: 40, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* Radial soft light behind center content */}
      <motion.div 
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-blue-500/5 blur-[120px] rounded-full mix-blend-screen" 
        style={{
          x: glowX,
          y: glowY,
        }}
      />

      {/* Depth Layers wrapper with radial mask to clear center */}
      <div 
        className="absolute inset-0 pointer-events-none"
        style={{
          maskImage: 'radial-gradient(circle at 50% 50%, transparent 15%, black 50%)',
          WebkitMaskImage: 'radial-gradient(circle at 50% 50%, transparent 15%, black 50%)'
        }}
      >
        {/* Layer 1 (Far background): Very sparse, strong blur, lowest opacity */}
        {!isSettings && (
          <motion.div
            className="absolute inset-0 flex items-center justify-center opacity-[0.02] blur-[3px]"
            style={{ x: smoothX, y: smoothY }}
          >
            <motion.div
              animate={isKanban ? {} : {
                y: [0, -40, 0],
                x: [0, 20, 0],
                rotate: [0, 2, 0]
              }}
              transition={{ duration: 40, repeat: Infinity, ease: "easeInOut" }}
            >
              <div className="grid grid-cols-6 gap-24 transform scale-[2] rotate-12">
                {Array.from({ length: 36 }).map((_, i) => {
                  if (i % 3 !== 0) return <div key={i} />; // Skip elements to reduce density
                  const Icon = i % 2 === 0 ? LayoutGrid : Users;
                  return <Icon key={i} className="w-5 h-5 text-white" />;
                })}
              </div>
            </motion.div>
          </motion.div>
        )}

        {/* Layer 2 (Mid layer): Fewer icons, medium blur */}
        {!isKanban && !isSettings && (
          <motion.div
            className="absolute inset-0 flex items-center justify-center opacity-[0.035] blur-[1.5px]"
            // Parallax inverted slightly and multiplied
            style={{ 
              x: midLayerX, 
              y: midLayerY 
            }}
          >
            <motion.div
              animate={{
                y: [0, 25, 0],
                x: [0, -25, 0],
                rotate: [0, -1, 0]
              }}
              transition={{ duration: 30, repeat: Infinity, ease: "easeInOut" }}
            >
              <div className="grid grid-cols-4 gap-32 transform scale-150 -rotate-6">
                {Array.from({ length: 16 }).map((_, i) => {
                  if (i % 2 !== 0) return <div key={i} />; // Skip elements
                  const Icon = i % 3 === 0 ? Zap : Target;
                  return <Icon key={i} className={`w-8 h-8 ${isDark ? 'text-white' : 'text-brand-accent'}`} />;
                })}
              </div>
            </motion.div>
          </motion.div>
        )}

        {/* Layer 3 (Near layer): Very few large shapes, no blur but low opacity */}
        {!isKanban && !isSettings && (
          <motion.div
            className="absolute inset-0 flex items-center justify-center opacity-[0.05]"
            style={{ 
              x: nearLayerX, 
              y: nearLayerY 
            }}
          >
            <motion.div
              animate={{
                y: [0, -15, 0],
                scale: [1, 1.05, 1]
              }}
              transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
            >
              <div className="flex flex-wrap gap-48 transform scale-125 justify-center mt-[20vh]">
                <Workflow className={`w-12 h-12 drop-shadow-[0_0_10px_rgba(59,130,246,0.3)] ${isDark ? 'text-blue-300' : 'text-blue-600'}`} />
                <CheckCircle2 className={`w-12 h-12 drop-shadow-[0_0_10px_rgba(168,85,247,0.3)] -mt-24 ${isDark ? 'text-purple-300' : 'text-purple-600'}`} />
              </div>
            </motion.div>
          </motion.div>
        )}
      </div>

      {/* 4. Glow System */}
      {/* Central glow pulse */}
      <motion.div 
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[60%] w-[40vw] h-[40vw] max-w-[600px] max-h-[600px] bg-brand-accent/20 blur-[150px] rounded-full mix-blend-screen"
        animate={isDashboard || isRoadmap ? {
          opacity: isDark ? [0.8, 1, 0.8] : [0.3, 0.5, 0.3],
          scale: [1, 1.05, 1]
        } : { opacity: 0.5, scale: 1 }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
      />
      
      {/* Secondary accent glow */}
      <motion.div 
        className="absolute bottom-[-10%] right-[-5%] w-[40vw] h-[40vw] max-w-[500px] max-h-[500px] bg-purple-600/10 blur-[120px] rounded-full mix-blend-screen"
        animate={isDashboard || isRoadmap ? {
          opacity: isDark ? [0.4, 0.8, 0.4] : [0.1, 0.3, 0.1],
          x: [0, -20, 0]
        } : { opacity: 0.2, x: 0 }}
        transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* 5. Noise / Texture */}
      <div 
        className="absolute inset-0 opacity-[0.015] mix-blend-overlay pointer-events-none"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`
        }}
      />
    </div>
  );
}

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Project, ProjectPhase } from '../types';
import { updateProject } from '../lib/services';
import { motion } from 'motion/react';
import { 
  Plus, 
  Trash2, 
  Target, 
  Flag, 
  Rocket, 
  TrendingUp, 
  Lightbulb, 
  Users, 
  Trophy 
} from 'lucide-react';
import { cn } from '../lib/utils';

import { useTranslation } from 'react-i18next';

interface MapViewProps {
  project: Project | null;
}

const START_Y = 60;

export function MapView({ project }: MapViewProps) {
  const { t } = useTranslation();
  const FLOATING_CARDS = useMemo(() => [
    { icon: Rocket, title: t('roadmap.cards.idea'), text: t('roadmap.cards.ideaDesc'), color: 'text-indigo-500', x: '8%', y: '12%', delay: 0 },
    { icon: Lightbulb, title: t('roadmap.cards.planning'), text: t('roadmap.cards.planningDesc'), color: 'text-amber-500', x: '82%', y: '18%', delay: 1.5 },
    { icon: TrendingUp, title: t('roadmap.cards.growth'), text: t('roadmap.cards.growthDesc'), color: 'text-emerald-500', x: '12%', y: '42%', delay: 0.8 },
    { icon: Users, title: t('roadmap.cards.team'), text: t('roadmap.cards.teamDesc'), color: 'text-blue-500', x: '85%', y: '55%', delay: 2.2 },
    { icon: Target, title: t('roadmap.cards.focus'), text: t('roadmap.cards.focusDesc'), color: 'text-rose-500', x: '15%', y: '75%', delay: 1.2 },
    { icon: Trophy, title: t('roadmap.cards.result'), text: t('roadmap.cards.resultDesc'), color: 'text-yellow-500', x: '78%', y: '88%', delay: 3 },
  ], [t]);

  const [phases, setPhases] = useState<ProjectPhase[]>(project?.phases || []);
  const [currentPhaseId, setCurrentPhaseId] = useState<string | null>(project?.currentPhaseId || null);
  const [editingPhaseId, setEditingPhaseId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const amplitude = isMobile ? 160 : 400;
  const stepY = isMobile ? 220 : 320;
  const viewWidth = isMobile ? 500 : 1000;
  const viewportLeft = isMobile ? -250 : -500;

  useEffect(() => {
    if (project?.phases) setPhases(project.phases);
    if (project?.currentPhaseId) setCurrentPhaseId(project.currentPhaseId);
  }, [project?.phases, project?.currentPhaseId]);

  const points = useMemo(() => {
    const p: {x: number, y: number}[] = [{ x: 0, y: START_Y }];
    for (let i = 1; i <= phases.length + 1; i++) {
        p.push({
            x: (i % 2 === 1) ? amplitude : (i % 2 === 0 && i !== 0 ? -amplitude : 0),
            y: START_Y + i * stepY
        });
    }
    return p;
  }, [phases.length, amplitude, stepY]);

  const generatePathD = (pointCount: number) => {
    if (pointCount < 2) return "";
    let dString = `M ${points[0].x},${points[0].y}`;
    for (let i = 0; i < pointCount - 1; i++) {
        const p0 = points[i];
        const p1 = points[i + 1];
        const cp1y = p0.y + (p1.y - p0.y) / 2;
        const cp2y = p0.y + (p1.y - p0.y) / 2;
        dString += ` C ${p0.x},${cp1y} ${p1.x},${cp2y} ${p1.x},${p1.y}`;
    }
    return dString;
  };

  const fullPathD = useMemo(() => generatePathD(points.length), [points]);

  const isGoalAchieved = currentPhaseId === 'goal_achieved';

  const currentPhaseIndex = useMemo(() => {
    if (!currentPhaseId || isGoalAchieved) return -1;
    return phases.findIndex(p => p.id === currentPhaseId);
  }, [phases, currentPhaseId, isGoalAchieved]);

  const progressPathD = useMemo(() => {
    if (isGoalAchieved) return fullPathD;
    if (currentPhaseIndex === -1) return "";
    return generatePathD(currentPhaseIndex + 2); 
  }, [fullPathD, points, currentPhaseIndex, isGoalAchieved]);

  const pointCoordinates = useMemo(() => {
    return points.slice(1, points.length - 1);
  }, [points]);

  const handlePhaseClick = async (phaseId: string) => {
    if (!project?.id) return;
    
    const index = phases.findIndex(p => p.id === phaseId);
    if (index === -1) return;

    const updatedPhases = phases.map((p, i) => {
        if (i < index) return { ...p, status: 'completed' as const };
        if (i === index) return { ...p, status: 'in_progress' as const };
        return { ...p, status: 'not_started' as const };
    });

    setPhases(updatedPhases);
    setCurrentPhaseId(phaseId);

    await updateProject(project.id, { 
        phases: updatedPhases,
        currentPhaseId: phaseId
    });
  };

  const handleGoalClick = async () => {
    if (!project?.id) return;
    
    const updatedPhases = phases.map(p => ({ ...p, status: 'completed' as const }));
    
    setPhases(updatedPhases);
    setCurrentPhaseId('goal_achieved');
    
    await updateProject(project.id, { 
        phases: updatedPhases,
        currentPhaseId: 'goal_achieved'
    });
  };

  const handlePathClick = async (e: React.MouseEvent) => {
    if (!project?.id || !containerRef.current) return;
    
    const rect = containerRef.current.getBoundingClientRect();
    const clickY = e.clientY - rect.top;
    
    let insertIndex = 0;
    for (let i = 0; i < phases.length; i++) {
        const coord = pointCoordinates[i];
        if (clickY > coord.y) {
            insertIndex = i + 1;
        }
    }

    const newPhase: ProjectPhase = {
      id: Math.random().toString(36).substr(2, 9),
      name: t('roadmap.newPhase'),
      status: 'not_started'
    };
    
    const updated = [...phases];
    updated.splice(insertIndex, 0, newPhase);
    
    setPhases(updated);
    setEditingPhaseId(newPhase.id);
    await updateProject(project.id, { phases: updated });
  };

  const handleUpdatePhaseName = async (id: string, name: string) => {
    if (!project?.id) return;
    const updated = phases.map(p => p.id === id ? { ...p, name } : p);
    setPhases(updated);
    setEditingPhaseId(null);
    await updateProject(project.id, { phases: updated });
  };

  const handleDeletePhase = async (id: string) => {
    if (!project?.id) return;
    const updated = phases.filter(p => p.id !== id);
    setPhases(updated);
    if (currentPhaseId === id) setCurrentPhaseId(null);
    await updateProject(project.id, { 
        phases: updated,
        currentPhaseId: currentPhaseId === id ? null : currentPhaseId
    });
  };

  const totalHeight = START_Y + (phases.length + 2) * stepY;

  return (
    <div className="flex flex-col items-center bg-gradient-to-br from-gray-50 via-white to-gray-100 dark:from-[#020617] dark:via-[#020617] dark:to-[#0f172a] min-h-screen w-full py-10 md:py-20 px-4 overflow-x-hidden relative text-foreground">
      {/* Visual background blobs */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[10%] -left-[5%] w-[40rem] h-[40rem] bg-purple-200/20 rounded-full blur-[100px] animate-pulse" />
        <div className="absolute top-[40%] -right-[10%] w-[35rem] h-[35rem] bg-blue-200/20 rounded-full blur-[120px] animate-pulse" style={{ animationDelay: '1s' }} />
        <div className="absolute bottom-[10%] left-[20%] w-[45rem] h-[45rem] bg-emerald-100/20 rounded-full blur-[100px] animate-pulse" style={{ animationDelay: '2s' }} />
      </div>

      {/* Decorative Floating Cards (Desktop only) */}
      {!isMobile && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden select-none">
          {FLOATING_CARDS.map((card, i) => (
            <motion.div
              key={i}
              className="absolute flex items-center gap-4 bg-white border border-gray-200 shadow-sm dark:bg-white/5 backdrop-blur-md p-4 pr-6 rounded-[24px] dark:border-white/10"
              style={{ left: card.x, top: card.y }}
              initial={{ y: 0 }}
              animate={{ y: [0, -25, 0], rotate: [0, 2, -2, 0] }}
              transition={{
                duration: 8 + Math.random() * 4,
                repeat: Infinity,
                delay: card.delay,
                ease: "easeInOut"
              }}
            >
              <div className={cn("p-2 rounded-xl bg-white/60 dark:bg-white/10 shadow-sm", card.color)}>
                <card.icon size={24} strokeWidth={2} />
              </div>
              <div className="flex flex-col text-left">
                <span className="text-[12px] font-black text-gray-900 dark:text-white uppercase tracking-wider">{card.title}</span>
                <span className="text-[10px] font-medium text-gray-400 leading-tight">{card.text}</span>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      <div className="text-center mb-10 relative z-10 pointer-events-auto">
        <motion.h1 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="text-4xl md:text-5xl font-bold text-gray-900 dark:text-white tracking-tight mb-2"
        >
          {t('roadmap.title')}
        </motion.h1>
        <motion.p 
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 0.65, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut", delay: 0.1 }}
          className="text-gray-600 dark:text-gray-400 text-lg font-medium px-4"
        >
          {t('roadmap.subtitle')}
        </motion.p>
      </div>

      {isMobile ? (
        <div className="w-full max-w-md relative z-10 space-y-0 px-4 pb-32 pointer-events-none">
          {/* Mobile Vertical Timeline */}
          <div className="relative">
            {/* The vertical line */}
            <div className="absolute left-6 top-10 bottom-10 w-1 bg-gray-100 dark:bg-white/10 rounded-full" />
            
            {/* Start point */}
            <div className="flex items-center gap-6 mb-12 relative pointer-events-auto">
              <div className="w-12 h-12 rounded-full bg-card border-4 border-indigo-600 flex items-center justify-center z-10 shadow-sm">
                <div className="w-3 h-3 rounded-full bg-indigo-600" />
              </div>
              <div className="flex flex-col">
                <span className="text-xl font-black text-foreground uppercase tracking-tight">{t('roadmap.start')}</span>
                <span className="text-sm text-gray-400 font-medium">{t('roadmap.startDesc')}</span>
              </div>
            </div>

            {/* Phases */}
            {phases.map((phase, i) => {
              const isCurrent = phase.id === currentPhaseId;
              const isCompleted = isGoalAchieved || i < currentPhaseIndex;
              
              return (
                <div key={phase.id} className="flex gap-6 mb-12 relative group pointer-events-auto">
                  <div className="flex flex-col items-center">
                    <motion.button
                      whileTap={{ scale: 0.9 }}
                      onClick={() => handlePhaseClick(phase.id)}
                      className={cn(
                        "w-12 h-12 rounded-full border-4 flex items-center justify-center z-10 transition-all duration-300 shadow-lg",
                        isCurrent ? "bg-white dark:bg-[#0f172a] border-indigo-600 ring-4 ring-indigo-100 dark:ring-indigo-900/40" :
                        isCompleted ? "bg-emerald-500 border-emerald-600" :
                        "bg-white border-gray-200 dark:bg-[#0f172a] dark:border-white/20"
                      )}
                    >
                      {isCompleted ? (
                        <Trophy size={20} className="text-white" />
                      ) : isCurrent ? (
                        <div className="w-4 h-4 rounded-full bg-indigo-600 animate-pulse" />
                      ) : null}
                    </motion.button>
                  </div>

                  <div className="flex-1 pt-1">
                    <div className="flex flex-col gap-1">
                      {isCurrent && (
                        <span className="text-[10px] font-black uppercase text-indigo-600 tracking-widest mb-1">
                          {t('roadmap.youAreHere')} ● {t('roadmap.activePhase')}
                        </span>
                      )}
                      
                      <div className="flex items-center justify-between gap-3">
                        {editingPhaseId === phase.id ? (
                          <input
                            autoFocus
                            defaultValue={phase.name}
                            onBlur={(e) => handleUpdatePhaseName(phase.id, e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleUpdatePhaseName(phase.id, (e.target as HTMLInputElement).value)}
                            className="bg-card border-b-2 border-indigo-500 outline-none px-2 py-1 font-bold text-lg text-foreground rounded-lg shadow-sm w-full"
                          />
                        ) : (
                          <span 
                            onClick={() => setEditingPhaseId(phase.id)}
                            className={cn(
                              "text-2xl font-black tracking-tight cursor-text",
                              isCurrent ? "text-indigo-600" : isCompleted ? "text-emerald-600" : "text-foreground"
                            )}
                          >
                            {phase.name}
                          </span>
                        )}
                        
                        <button 
                          onClick={() => handleDeletePhase(phase.id)}
                          className="p-2 text-gray-300 hover:text-red-500 transition-colors"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>

                      <span className={cn(
                        "text-[10px] font-black uppercase tracking-[0.2em] px-2 py-0.5 rounded-full w-fit",
                        isCompleted ? "bg-emerald-100 text-emerald-600" : 
                        isCurrent ? "bg-indigo-100 text-indigo-600" : 
                        "bg-gray-100 text-gray-400"
                      )}>
                        {isCompleted ? t('roadmap.status.completed') : isCurrent ? t('roadmap.status.inProgress') : t('roadmap.status.waiting')}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Goal Point */}
            <div className="flex items-center gap-6 relative pointer-events-auto">
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={handleGoalClick}
                className={cn(
                  "w-12 h-12 rounded-full border-4 flex items-center justify-center z-10 transition-all duration-300 shadow-xl",
                  isGoalAchieved ? "bg-emerald-600 border-emerald-700" : "bg-white border-gray-200 dark:bg-[#0f172a] dark:border-white/20"
                )}
              >
                <Flag size={20} className={cn(isGoalAchieved ? "text-white" : "text-gray-300")} />
              </motion.button>
              <div className="flex flex-col">
                <span className={cn(
                  "text-xl font-black uppercase tracking-tight",
                  isGoalAchieved ? "text-emerald-600" : "text-gray-400"
                )}>
                  {t('roadmap.finish')}
                </span>
                <span className="text-sm text-gray-400 font-medium">{t('roadmap.finishDesc')}</span>
              </div>
            </div>
          </div>

          {/* Add Phase Mobile Button */}
          <div className="fixed bottom-10 left-1/2 -translate-x-1/2 w-full px-8 z-[9999] pointer-events-none">
             <motion.button
               whileTap={{ scale: 0.95 }}
               onClick={handlePathClick}
               className="w-full h-16 bg-gray-900 dark:bg-gray-800 text-white rounded-2xl flex items-center justify-center gap-3 shadow-2xl font-black uppercase tracking-widest text-sm border border-white/10 relative z-50 pointer-events-auto"
             >
               <Plus size={24} />
               {t('roadmap.addPhase')}
             </motion.button>
          </div>
        </div>
      ) : (
        <div className="relative w-full max-w-5xl z-10 pointer-events-none" style={{ height: totalHeight }} ref={containerRef}>
          <svg 
            width="100%" 
            height={totalHeight}
            viewBox={`${viewportLeft} 0 ${viewWidth} ${totalHeight}`}
            className="overflow-visible"
          >
            <defs>
              <linearGradient id="pathGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#6366f1" />
                <stop offset="50%" stopColor="#a855f7" />
                <stop offset="100%" stopColor="#10b981" />
              </linearGradient>
              
              <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="6" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
            </defs>

            {/* Background Gray Path */}
            <path
              d={fullPathD}
              fill="none"
              stroke="#f1f5f9"
              strokeWidth="10"
              strokeLinecap="round"
              className="cursor-pointer dark:opacity-10"
              onClick={handlePathClick}
            />
            
            {/* Progress Path Shadow/Glow */}
            <motion.path
              key={`glow-${progressPathD}`}
              d={progressPathD}
              fill="none"
              stroke="url(#pathGradient)"
              strokeWidth="16"
              strokeOpacity="0.15"
              strokeLinecap="round"
              className="pointer-events-none"
              filter="blur(10px)"
            />

            {/* Colored Progress Path */}
            <motion.path
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              key={progressPathD}
              d={progressPathD}
              fill="none"
              stroke="url(#pathGradient)"
              strokeWidth="8"
              strokeLinecap="round"
              className="pointer-events-none"
              transition={{ duration: 1.5, ease: "easeInOut" }}
            />

            {/* Start Point */}
            <g transform={`translate(0, ${START_Y})`}>
              <circle r={16} fill={currentPhaseIndex >= 0 ? "#6366f1" : "white"} stroke="#f1f5f9" strokeWidth={6} className={currentPhaseIndex >= 0 ? "" : "dark:fill-[#0f172a] dark:stroke-white/20"} />
              <motion.g 
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                className="pointer-events-none"
              >
                <text 
                   x="-35"
                   y="-10" 
                   textAnchor="end" 
                   className="fill-current text-foreground font-bold text-[28px]"
                   style={{ fontWeight: 700 }}
                >
                  {t('roadmap.start')}
                </text>
                <text 
                   x="-35"
                   y="12" 
                   textAnchor="end" 
                   className="fill-gray-400 font-medium text-[12px]"
                >
                  {t('roadmap.startDesc')}
                </text>
              </motion.g>
            </g>

            {/* End Goal */}
            <g transform={`translate(${points[points.length-1].x}, ${points[points.length-1].y})`}>
              <motion.circle 
                r={34} 
                fill={isGoalAchieved ? "#10b981" : "white"} 
                stroke={isGoalAchieved ? "#059669" : "#f1f5f9"} 
                strokeWidth={8} 
                whileHover={{ scale: 1.1 }}
                onClick={handleGoalClick}
                className={cn("cursor-pointer", !isGoalAchieved && "dark:fill-[#0f172a] dark:stroke-white/20")}
                style={{ 
                  filter: isGoalAchieved ? 'drop-shadow(0 0 25px rgba(16, 185, 129, 0.4))' : 'none' 
                }}
              />
              
              <g className="pointer-events-none">
                  <Flag 
                      x="-14" 
                      y="-14" 
                      size={28} 
                      className={cn(isGoalAchieved ? "text-white" : "text-gray-300")} 
                      strokeWidth={3}
                  />
              </g>

              {isGoalAchieved && (
                <motion.g 
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <rect x="-90" y="55" width="180" height="32" rx="16" className="fill-emerald-600 shadow-2xl" />
                  <text y="76" textAnchor="middle" className="fill-white font-bold pointer-events-none text-[13px]">
                    {t('roadmap.goalAchieved')}
                  </text>
                </motion.g>
              )}
              
              {!isGoalAchieved && (
                  <text 
                      y="75" 
                      textAnchor="middle" 
                      className="fill-gray-400 font-bold text-[18px]"
                  >
                      {t('roadmap.finish')}
                  </text>
              )}
            </g>

            {/* Render Phases along the path */}
            {phases.map((phase, i) => {
              const coord = pointCoordinates[i];
              if (!coord) return null;
              
              const isRight = coord.x > 0;
              const isCurrent = phase.id === currentPhaseId;
              const isCompleted = isGoalAchieved || i < currentPhaseIndex;

              return (
                <g key={phase.id} transform={`translate(${coord.x}, ${coord.y})`}>
                  {/* Visual Circle */}
                  <motion.circle
                    initial={{ scale: 0 }}
                    animate={{ 
                      scale: isCurrent ? 1.4 : 1,
                    }}
                    whileHover={{ scale: 1.5 }}
                    r={26}
                    onClick={() => handlePhaseClick(phase.id)}
                    className={cn(
                      "cursor-pointer transition-all duration-700",
                      isCurrent ? "fill-white dark:fill-[#0f172a] stroke-indigo-600" : 
                      isCompleted ? "fill-emerald-500 stroke-emerald-600" : 
                      "fill-card stroke-border"
                    )}
                    strokeWidth={isCurrent ? "12" : "6"}
                    style={{ 
                      filter: isCurrent ? 'drop-shadow(0 0 35px rgba(99, 102, 241, 0.6))' : 
                              isCompleted ? 'drop-shadow(0 0 15px rgba(16, 185, 129, 0.3))' : 'none' 
                    }}
                  />

                  {isCurrent && (
                    <motion.circle
                      r="26"
                      fill="none"
                      stroke="#6366f1"
                      strokeWidth="2"
                      animate={{ scale: [1, 1.9], opacity: [0.5, 0] }}
                      transition={{ duration: 1.8, repeat: Infinity }}
                    />
                  )}

                  {/* You are here badge */}
                  {isCurrent && (
                    <motion.g 
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                    >
                      <rect x="-70" y="45" width="140" height="28" rx="14" className="fill-indigo-600 shadow-2xl" />
                      <text y="63" textAnchor="middle" className="fill-white text-[12px] font-bold pointer-events-none">
                        {t('roadmap.youAreHere')}
                      </text>
                    </motion.g>
                  )}

                  <foreignObject 
                    x={isRight ? 65 : -365} 
                    y={-55} 
                    width={300} 
                    height={140}
                    className="overflow-visible pointer-events-none"
                  >
                    <div className={cn(
                      "flex flex-col gap-1 pointer-events-auto transition-all duration-700",
                      isRight ? "text-left items-start" : "text-right items-end",
                      isCurrent ? "scale-110" : "opacity-70"
                    )}>
                      {editingPhaseId === phase.id ? (
                        <input
                          autoFocus
                          defaultValue={phase.name}
                          onBlur={(e) => handleUpdatePhaseName(phase.id, e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleUpdatePhaseName(phase.id, (e.target as HTMLInputElement).value)}
                          className="bg-card/80 border-b-2 border-indigo-500 outline-none px-2 py-1 font-bold text-lg text-foreground rounded-lg shadow-xl w-full max-w-[200px] backdrop-blur-md"
                        />
                      ) : (
                        <div className="group flex items-center gap-4">
                          {!isRight && (
                            <button 
                              onClick={() => handleDeletePhase(phase.id)}
                              className="p-2 opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 hover:bg-white/80 dark:hover:bg-white/10 rounded-full transition-all focus:opacity-100 backdrop-blur-sm"
                            >
                              <Trash2 size={20} />
                            </button>
                          )}
                          <span 
                            onClick={() => setEditingPhaseId(phase.id)}
                            className={cn(
                               "transition-all cursor-text group-hover:text-indigo-500 leading-tight text-3xl font-black",
                               isCurrent ? "text-indigo-600 drop-shadow-sm" : isCompleted ? "text-emerald-600" : "text-foreground"
                            )}
                          >
                            {phase.name}
                          </span>
                          {isRight && (
                            <button 
                              onClick={() => handleDeletePhase(phase.id)}
                              className="p-2 opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 hover:bg-white/80 dark:hover:bg-white/10 rounded-full transition-all focus:opacity-100 backdrop-blur-sm"
                            >
                              <Trash2 size={20} />
                            </button>
                          )}
                        </div>
                      )}
                      <span className={cn(
                        "font-black uppercase px-2 py-0.5 rounded-full text-[11px] tracking-[0.4em]",
                        isCurrent ? "bg-indigo-600 text-white" : 
                        isCompleted ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400" : 
                        "bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500"
                      )}>
                        {isCompleted ? t('roadmap.status.success') : isCurrent ? t('roadmap.status.active') : t('roadmap.status.next')}
                      </span>
                    </div>
                  </foreignObject>
                </g>
              );
            })}
          </svg>

          {/* Floating Controls Desktop */}
          <div className="fixed bottom-12 right-12 z-50 pointer-events-none">
              <motion.button 
                whileHover={{ scale: 1.1, rotate: 90 }}
                whileTap={{ scale: 0.9 }}
                onClick={handlePathClick}
                className="w-20 h-20 bg-gray-900 text-white rounded-full flex items-center justify-center shadow-[0_20px_50px_rgba(0,0,0,0.3)] hover:shadow-indigo-500/40 transition-all border border-white/10 pointer-events-auto"
              >
                <Plus size={44} />
              </motion.button>
          </div>
        </div>
      )}
    </div>
  );
}

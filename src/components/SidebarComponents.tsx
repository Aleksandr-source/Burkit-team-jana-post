import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  Terminal,
  Palette,
  Gamepad2,
  Folder,
  LayoutGrid,
  LucideIcon,
  MoreHorizontal,
  Pencil,
  Trash2,
  Loader2,
  Pin,
  PinOff,
  AlertTriangle,
  Kanban,
  Search,
  PanelLeft
} from "lucide-react";
import { cn } from "../lib/utils";
import { Link, useNavigate } from "react-router-dom";
import { Project } from "../types";
import { useSidebar } from "../lib/SidebarContext";
import {
  deleteProject,
  updateProject,
  updateProjectOrders,
} from "../lib/services";
import { useAuth } from "../lib/AuthContext";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useTranslation, Trans } from "react-i18next";

export const SidebarHeader = ({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) => {
  const navigate = useNavigate();
  const { setIsMobileOpen } = useSidebar();
  
  if (collapsed) {
    return (
      <div className="flex flex-col items-center mb-6 pt-2">
        <button onClick={onToggle} className="mb-4 p-1.5 rounded-lg text-brand-text-muted hover:text-brand-text-main hover:bg-brand-surface-hover transition-colors focus:outline-none">
            <PanelLeft className="w-5 h-5" />
        </button>
        <div 
          onClick={() => {
            navigate('/');
            if (window.innerWidth < 768) setIsMobileOpen(false);
          }}
          className="w-10 h-10 rounded-[14px] bg-[linear-gradient(135deg,#4f7cff,#7c3aed)] shadow-sm flex items-center justify-center text-white cursor-pointer"
        >
          <Kanban className="w-5 h-5 opacity-90" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between mb-8 px-2 pt-2">
      <div 
        onClick={() => {
          navigate('/');
          if (window.innerWidth < 768) setIsMobileOpen(false);
        }}
        className="flex items-center gap-3 cursor-pointer"
      >
        <div className="w-9 h-9 rounded-[14px] bg-[linear-gradient(135deg,#4f7cff,#7c3aed)] shadow-sm flex items-center justify-center text-white">
          <Kanban className="w-5 h-5 opacity-90" />
        </div>
        <h2 className="font-bold text-[18px] tracking-tight text-brand-text-main">
          Asar
        </h2>
      </div>
      <button onClick={onToggle} className="p-1.5 rounded-lg text-brand-text-muted hover:text-brand-text-main hover:bg-brand-surface-hover transition-colors focus:outline-none">
        <PanelLeft className="w-5 h-5" />
      </button>
    </div>
  );
};

interface SidebarProjectsProps {
  projects: Project[];
  projectId?: string;
  collapsed: boolean;
  t: (key: string, options?: { defaultValue?: string }) => string;
}

function getProjectIcon(name: string): LucideIcon {
  const lowerName = name.toLowerCase();

  if (
    lowerName.includes("dev") ||
    lowerName.includes("code") ||
    lowerName.includes("app")
  ) {
    return Terminal;
  }
  if (lowerName.includes("design") || lowerName.includes("ui")) {
    return Palette;
  }
  if (lowerName.includes("game")) {
    return Gamepad2;
  }
  if (lowerName.includes("task") || lowerName.includes("project")) {
    return Folder;
  }

  return LayoutGrid;
}

const PROJECT_COLORS: Record<string, string> = {
  blue: "bg-blue-500",
  emerald: "bg-emerald-500",
  amber: "bg-amber-500",
  rose: "bg-rose-500",
  violet: "bg-violet-500",
  fuchsia: "bg-fuchsia-500",
  cyan: "bg-cyan-500",
  slate: "bg-slate-500",
};

interface ProjectListItemProps {
  p: Project;
  projectId?: string;
  collapsed: boolean;
  allProjects: Project[];
}

const ProjectListItem = ({
  p,
  projectId,
  collapsed,
  allProjects,
}: ProjectListItemProps) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: p.id,
    data: { type: "Project", project: p },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: transition || "transform 200ms cubic-bezier(0.2, 0, 0, 1)",
    zIndex: isDragging ? 50 : 1,
    opacity: isDragging ? 0.4 : 1,
  };

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isRenameModalOpen, setIsRenameModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [newName, setNewName] = useState(p.name);
  const [selectedColor, setSelectedColor] = useState(p.color || "blue");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const navigate = useNavigate();
  const { setIsMobileOpen } = useSidebar();
  const menuRef = useRef<HTMLDivElement>(null);

  const isOwner = user?.uid === p.ownerId;

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsMenuOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsRenameModalOpen(false);
        setIsDeleteModalOpen(false);
        setDeleteConfirmText("");
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const IconComponent = getProjectIcon(p.name);

  const handleEdit = async () => {
    if (!newName.trim()) {
      setIsRenameModalOpen(false);
      return;
    }
    const cleanName = newName.trim();
    if (cleanName === p.name && selectedColor === p.color) {
      setIsRenameModalOpen(false);
      return;
    }
    setIsSubmitting(true);
    try {
      await updateProject(p.id, { name: cleanName, color: selectedColor });
      setIsRenameModalOpen(false);
    } catch (err) {
      console.error("Rename failed", err);
      alert(err instanceof Error ? err.message : t("sidebar.renameFailed"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    setIsSubmitting(true);
    try {
      await deleteProject(p.id);
      setIsDeleteModalOpen(false);
      if (projectId === p.id) {
        const otherProjects = allProjects.filter(project => project.id !== p.id);
        if (otherProjects.length > 0) {
          navigate(`/project/${otherProjects[0].id}`);
        } else {
          navigate("/");
        }
      }
    } catch (err) {
      console.error("Delete failed", err);
      alert(err instanceof Error ? err.message : t("sidebar.deleteFailed"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const togglePin = async () => {
    try {
      await updateProject(p.id, { isPinned: !p.isPinned });
      setIsMenuOpen(false);
    } catch (e) {
      console.error("Toggle pin failed", e);
    }
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <Link
        {...listeners}
        to={`/project/${p.id}`}
        onClick={() => {
          if (window.innerWidth < 768) setIsMobileOpen(false);
        }}
        className={cn(
          "relative rounded-[14px] text-[13px] font-medium transition-all duration-300 flex items-center justify-between group outline-none",
          collapsed ? "justify-center p-1 mx-auto w-12 h-12" : "px-3 py-2.5",
          projectId === p.id
            ? "bg-[linear-gradient(135deg,#4f7cff,#7c3aed)] text-white shadow-[0_4px_12px_rgba(79,124,255,0.25)]"
            : "text-brand-text-muted hover:text-brand-text-main hover:bg-brand-surface-hover",
        )}
      >
        <div className="flex items-center gap-3 overflow-hidden">
          <div
            className={cn(
              "rounded-xl flex items-center justify-center shrink-0 transition-transform duration-200 group-hover:scale-105",
              collapsed ? "w-10 h-10" : "w-8 h-8",
              projectId === p.id 
                ? "text-white" 
                : "text-brand-text-muted group-hover:text-brand-text-main focus-within:text-brand-text-main"
            )}
          >
            <IconComponent strokeWidth={projectId === p.id ? 2.5 : 2} className={cn(collapsed ? "w-5 h-5" : "w-[18px] h-[18px]")} />
          </div>

          {!collapsed && (
            <span
              className={cn(
                "truncate flex-1 font-semibold",
                projectId === p.id ? "text-white" : "text-brand-text-main"
              )}
            >
              {p.name}
            </span>
          )}
        </div>

        {/* Tooltip for Collapsed Sidebar */}
        {collapsed && (
          <div className="absolute left-full top-1/2 -translate-y-1/2 ml-4 px-3 py-2 bg-brand-surface text-brand-text-main text-xs font-bold rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-[100] shadow-md border border-brand-border transition-all duration-200 translate-x-1 group-hover:translate-x-0">
            {p.name}
          </div>
        )}

        {!collapsed && (
          <div
            ref={menuRef}
            className={cn(
              "relative transition-opacity duration-200 z-10",
              isMenuOpen ? "opacity-100" : "opacity-0 group-hover:opacity-100",
            )}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsMenuOpen(!isMenuOpen);
              }}
              className={cn(
                "p-1 rounded-md transition-colors",
                projectId === p.id ? "text-white/80 hover:text-white hover:bg-white/10" : "text-brand-text-muted hover:text-brand-text-main hover:bg-brand-surface-hover"
              )}
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>

            {isMenuOpen && (
              <div className="absolute right-0 top-full mt-1 w-44 bg-brand-surface border border-brand-border rounded-2xl shadow-[0_10px_30px_-5px_rgba(0,0,0,0.1)] overflow-hidden py-1.5 z-[100] animate-in fade-in zoom-in-95 duration-100">
                <button
                  onClick={() => {
                    setIsMenuOpen(false);
                    togglePin();
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 text-[12px] text-brand-text-main hover:bg-brand-surface-hover transition-colors font-medium"
                >
                  {p.isPinned ? (
                    <PinOff className="w-4 h-4" />
                  ) : (
                    <Pin className="w-4 h-4" />
                  )}
                  {p.isPinned
                    ? t("sidebar.unpinProject")
                    : t("sidebar.pinProject")}
                </button>
                {isOwner && (
                  <>
                    <div className="h-px bg-brand-border my-1 font-bold" />
                    <button
                      onClick={() => {
                        setIsMenuOpen(false);
                        setNewName(p.name);
                        setSelectedColor(p.color || "blue");
                        setIsRenameModalOpen(true);
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2.5 text-[12px] text-brand-text-main hover:bg-brand-surface-hover transition-colors font-medium"
                    >
                      <Pencil className="w-4 h-4" />
                      {t("sidebar.editProject")}
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </Link>

      {/* Edit Project Modal */}
      {isRenameModalOpen &&
        createPortal(
          <div
            className="fixed inset-0 z-[9990] flex items-center justify-center bg-black/40 dark:bg-black/60 backdrop-blur-sm px-4"
            onClick={() => setIsRenameModalOpen(false)}
          >
            <div
              className="bg-brand-surface border border-brand-border rounded-[24px] shadow-[0_30px_80px_rgba(0,0,0,0.3)] w-full max-w-[500px] p-[28px] animate-in fade-in zoom-in-95 duration-250 ease-out"
              style={{
                transform: "translateY(20px) scale(0.96)",
                animation: "modalSlideIn 0.25s ease forwards",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-brand-text-main font-bold text-[22px] mb-6">
                {t("sidebar.editProjectTitle")}
              </h3>

              <div className="flex flex-col gap-[16px]">
                <div className="space-y-3">
                  <label className="text-[14px] text-brand-text-muted font-black uppercase tracking-widest ml-1">
                    {t("sidebar.projectName")}
                  </label>
                  <input
                    autoFocus
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="w-full bg-brand-bg border border-brand-border rounded-[14px] px-[14px] py-[14px] text-[15px] text-brand-text-main font-medium outline-none focus:border-brand-accent focus:ring-4 focus:ring-brand-accent/5 transition-all shadow-sm"
                    placeholder={t("sidebar.projectName")}
                    onKeyDown={(e) =>
                      e.key === "Enter" && !isSubmitting && handleEdit()
                    }
                  />
                </div>

                <div className="space-y-3">
                  <label className="text-[14px] text-brand-text-muted font-black uppercase tracking-widest ml-1">
                    {t("sidebar.projectColor")}
                  </label>
                  <div className="flex flex-wrap gap-4 py-1">
                    {Object.keys(PROJECT_COLORS).map((cKey) => (
                      <button
                        key={cKey}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setSelectedColor(cKey);
                        }}
                        className={cn(
                          "w-[36px] h-[36px] shrink-0 rounded-full transition-all duration-200 focus:outline-none cursor-pointer hover:scale-[1.15]",
                          PROJECT_COLORS[cKey],
                          selectedColor === cKey
                            ? "outline outline-[3px] outline-brand-accent outline-offset-2"
                            : "opacity-80 hover:opacity-100",
                        )}
                      />
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex gap-4 justify-end mt-[28px]">
                <button
                  disabled={isSubmitting}
                  onClick={() => setIsRenameModalOpen(false)}
                  className="px-5 py-3 rounded-[12px] text-[14px] font-bold text-brand-text-muted hover:text-brand-text-main hover:bg-brand-surface-hover transition-all"
                >
                  {t("common.cancel")}
                </button>
                <button
                  disabled={!newName.trim() || isSubmitting}
                  onClick={handleEdit}
                  className="px-5 py-3 rounded-[12px] text-[14px] font-black text-white bg-brand-accent shadow-lg shadow-brand-accent/20 hover:-translate-y-[1px] disabled:opacity-50 disabled:hover:translate-y-0 disabled:shadow-none flex items-center gap-2 transition-all"
                >
                  {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  {t("common.save")}
                </button>
              </div>

              {/* Danger Zone */}
              <div className="mt-[20px] bg-rose-500/10 border border-rose-500/20 rounded-[14px] p-4 text-left">
                <div className="mb-2 flex items-center gap-2 text-rose-500 font-bold">
                  <AlertTriangle className="w-4 h-4" />
                  <h4 className="text-[14px] font-black uppercase tracking-wider">{t("sidebar.dangerZone")}</h4>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <p className="text-rose-500 opacity-80 text-[13px] leading-relaxed font-medium">
                    {t("sidebar.deleteProjectDescription")}
                  </p>
                  <button
                    onClick={() => {
                      setIsRenameModalOpen(false);
                      setIsDeleteModalOpen(true);
                    }}
                    disabled={isSubmitting}
                    className="px-4 py-2.5 rounded-[10px] text-[13px] font-black uppercase tracking-wider bg-red-500 text-white hover:bg-red-600 shadow-sm shrink-0 transition-colors"
                  >
                    {t("sidebar.deleteProject")}
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {/* Delete Modal */}
      {isDeleteModalOpen &&
        createPortal(
          <div
            className="fixed inset-0 z-[9990] flex items-center justify-center bg-black/40 dark:bg-black/60 backdrop-blur-sm px-4"
            onClick={() => {
              setIsDeleteModalOpen(false);
              setDeleteConfirmText("");
            }}
          >
            <div
              className="bg-brand-surface border border-brand-border rounded-[24px] shadow-[0_30px_80px_rgba(0,0,0,0.3)] w-full max-w-[480px] p-[28px] animate-in fade-in zoom-in-95 duration-250 ease-out flex flex-col"
              style={{
                transform: "translateY(20px) scale(0.96)",
                animation: "modalSlideIn 0.25s ease forwards",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-brand-text-main text-[22px] font-bold mb-4">
                {t("sidebar.deleteProjectConfirm")}
              </h3>
              <div className="mb-[24px]">
                <p className="text-brand-text-muted text-[14px] leading-relaxed mb-6 font-medium">
                  {t("sidebar.deleteProjectWarning")}
                </p>

                <div className="space-y-3">
                  <label className="text-[14px] text-brand-text-muted font-black uppercase tracking-widest ml-1">
                    <Trans
                      i18nKey="sidebar.deleteConfirmPrompt"
                      values={{ name: p.name }}
                      components={[
                        <span key="0" />,
                        <span key="1" className="text-red-500 font-black select-none" />
                      ]}
                    />
                  </label>
                  <input
                    autoFocus
                    value={deleteConfirmText}
                    onChange={(e) => setDeleteConfirmText(e.target.value)}
                    className="w-full bg-brand-bg border border-brand-border rounded-[14px] px-[14px] py-[14px] text-[15px] font-medium text-brand-text-main outline-none focus:border-red-500 focus:ring-4 focus:ring-red-500/10 transition-all shadow-sm"
                    placeholder={t("sidebar.deleteConfirmPlaceholder")}
                    onKeyDown={(e) =>
                      e.key === "Enter" &&
                      deleteConfirmText === p.name &&
                      !isSubmitting &&
                      handleDelete()
                    }
                  />
                </div>
              </div>
              <div className="flex gap-4 justify-end">
                <button
                  disabled={isSubmitting}
                  onClick={() => {
                    setIsDeleteModalOpen(false);
                    setDeleteConfirmText("");
                  }}
                  className="px-5 py-3 rounded-[12px] text-[14px] font-bold text-brand-text-muted hover:text-brand-text-main hover:bg-brand-surface-hover transition-all"
                >
                  {t("common.cancel")}
                </button>
                <button
                  disabled={isSubmitting || deleteConfirmText !== p.name}
                  onClick={handleDelete}
                  className="px-5 py-3 rounded-[12px] text-[14px] font-black uppercase tracking-wider bg-red-500 hover:bg-red-600 text-white disabled:opacity-50 flex items-center gap-2 transition-all shadow-lg shadow-red-500/20 hover:-translate-y-[1px]"
                >
                  {isSubmitting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                  {t("sidebar.deleteProject")}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
};

export const SidebarProjects = ({
  projects,
  projectId,
  collapsed,
  t,
}: SidebarProjectsProps) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [localProjects, setLocalProjects] = useState<Project[]>([]);

  useEffect(() => {
    const sorted = [...projects].sort((a, b) => {
      return (a.order || 0) - (b.order || 0);
    });
    setLocalProjects(sorted);
  }, [projects]);

  const filteredProjects = localProjects.filter((p) =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const pinnedProjects = filteredProjects.filter((p) => p.isPinned);
  const regularProjects = filteredProjects.filter((p) => !p.isPinned);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = localProjects.findIndex((p) => p.id === active.id);
    const newIndex = localProjects.findIndex((p) => p.id === over.id);

    if (oldIndex !== -1 && newIndex !== -1) {
      const oldProject = localProjects[oldIndex];
      const newProject = localProjects[newIndex];

      // Prevent dragging between pinned and unpinned directly. Use menu action instead.
      if (oldProject.isPinned === newProject.isPinned) {
        const newArray = arrayMove(localProjects, oldIndex, newIndex);
        setLocalProjects(newArray);

        // Compute contiguous updates internally for group
        const groupUpdates = newArray
          .filter((p: Project) => p.isPinned === oldProject.isPinned)
          .map((p: Project, idx: number) => ({ id: p.id, order: idx }));

        updateProjectOrders(groupUpdates).catch(console.error);
      }
    }
  };

  return (
    <div
      className={cn(
        "flex-1 flex flex-col overflow-y-auto overflow-x-hidden sidebar-scrollbar",
        collapsed ? "gap-4 px-1 mt-4" : "gap-2 px-3 mt-2",
      )}
    >
      {collapsed ? (
        <div className="flex justify-center mb-6">
          <button className="w-10 h-10 rounded-xl flex items-center justify-center text-brand-text-muted hover:text-brand-text-main hover:bg-brand-surface-hover transition-colors focus:outline-none">
            <Search className="w-5 h-5" />
          </button>
        </div>
      ) : (
        <div className="relative mb-6 px-1">
          <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-brand-text-muted pointer-events-none" />
          <input
            type="text"
            placeholder={t("sidebar.search", { defaultValue: "Поиск..." })}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 text-[13px] bg-brand-surface-hover border border-brand-border rounded-[12px] text-brand-text-main placeholder:text-brand-text-muted outline-none focus:ring-2 focus:ring-brand-accent/20 focus:border-brand-accent transition-all font-medium whitespace-nowrap"
          />
        </div>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        {pinnedProjects.length > 0 && (
          <div className={cn(collapsed ? "space-y-4" : "mb-6 space-y-2")}>
            {!collapsed && (
              <p className="text-[10px] uppercase text-amber-500 font-bold mb-3 pl-3 tracking-widest flex items-center gap-2">
                <Pin className="w-3.5 h-3.5" /> {t("sidebar.pinned")}
              </p>
            )}
              <SortableContext
                items={pinnedProjects.map((p) => p.id)}
                strategy={verticalListSortingStrategy}
              >
                {pinnedProjects.map((p) => (
                  <ProjectListItem
                    key={p.id}
                    p={p}
                    projectId={projectId}
                    collapsed={collapsed}
                    allProjects={projects}
                  />
                ))}
              </SortableContext>
            </div>
          )}
  
          <div className={cn(collapsed ? "space-y-4" : "mb-6 space-y-2")}>
            {!collapsed && (
              <p className="text-[10px] uppercase text-brand-text-muted font-bold mb-3 pl-3 tracking-widest">
                {t("sidebar.projects")}
              </p>
            )}
            <SortableContext
              items={regularProjects.map((p) => p.id)}
              strategy={verticalListSortingStrategy}
            >
              {regularProjects.map((p) => (
                <ProjectListItem
                  key={p.id}
                  p={p}
                  projectId={projectId}
                  collapsed={collapsed}
                  allProjects={projects}
                />
              ))}
            </SortableContext>
          </div>
      </DndContext>
    </div>
  );
};

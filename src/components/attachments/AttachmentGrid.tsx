import React, { useState, useCallback } from 'react';
import { FileText, Music, Link as LinkIcon, Download, Trash2, X, Upload, Loader2 } from 'lucide-react';
import { Attachment } from '../../types';
import { getFirestore, doc, updateDoc, arrayRemove } from 'firebase/firestore';
import { createPortal } from 'react-dom';
import { cn } from '../../lib/utils';
import { useToast } from '../../lib/ToastContext';
import { useUploadAttachment } from '../../hooks/useAttachments';

export const AttachmentGrid = ({ projectId, taskId, attachments, readOnly }: { projectId: string, taskId: string, attachments?: Attachment[], readOnly?: boolean }) => {
  const { uploadMultipleFiles, isUploading, progress } = useUploadAttachment(projectId, taskId);
  const { toast } = useToast();
  const [isDragActive, setIsDragActive] = useState(false);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!readOnly) setIsDragActive(true);
  }, [readOnly]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!readOnly && !isDragActive) {
      setIsDragActive(true);
    }
  }, [isDragActive, readOnly]);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);

    if (!readOnly && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      // Background upload (don't block UI)
      uploadMultipleFiles(e.dataTransfer.files).then(() => {
        toast('Files uploaded successfully', 'success');
      }).catch((err) => {
        toast('Failed to upload files', 'error');
        console.error(err);
      });
    }
  }, [readOnly, uploadMultipleFiles]);

  if ((!attachments || attachments.length === 0) && !isDragActive && !isUploading) {
    return (
      <div 
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        className="w-full border-2 border-dashed border-brand-border/50 rounded-xl p-8 flex flex-col items-center justify-center text-brand-text-muted hover:border-brand-accent/30 hover:bg-brand-surface-hover/30 transition-all cursor-pointer"
        onClick={() => {
          // If we had a direct file input ref we could trigger it, but for now it's just a dropzone
        }}
      >
         <Upload className="w-6 h-6 mb-2 opacity-50" />
         <p className="text-sm font-medium">Drag & drop files here to attach</p>
      </div>
    );
  }

  return (
    <div 
      className="relative w-full"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <div className={cn("grid grid-cols-2 md:grid-cols-3 gap-3", isDragActive && "opacity-50 blur-[2px] pointer-events-none")}>
        {attachments?.map((attachment) => (
          <AttachmentItem key={attachment.id} projectId={projectId} taskId={taskId} attachment={attachment} readOnly={readOnly} />
        ))}
        {isUploading && (
          <div className="border border-brand-border/50 rounded-xl overflow-hidden bg-brand-surface-hover/30 flex flex-col items-center justify-center h-32 gap-3 animate-pulse shadow-sm">
             <Loader2 className="w-6 h-6 text-brand-accent animate-spin" />
             <div className="w-3/4 max-w-[120px]">
               <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                 <div className="h-full bg-brand-accent transition-all duration-300" style={{ width: `${progress}%` }} />
               </div>
             </div>
             <span className="text-[11px] font-bold text-brand-text-muted">Uploading...</span>
          </div>
        )}
      </div>

      {isDragActive && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-brand-surface/80 backdrop-blur-sm rounded-xl border-2 border-dashed border-brand-accent pointer-events-none">
          <div className="flex flex-col items-center text-brand-accent">
            <Upload className="w-8 h-8 mb-2 animate-bounce" />
            <span className="text-sm font-bold tracking-wide">Drop to attach</span>
          </div>
        </div>
      )}
    </div>
  );
};

export const AttachmentItem = ({ projectId, taskId, attachment, readOnly }: { projectId: string; taskId: string, attachment: Attachment, readOnly?: boolean }) => {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [localUrl, setLocalUrl] = useState<string | null>(null);
  const { toast } = useToast();

  React.useEffect(() => {
    let objectUrl: string | null = null;
    if (attachment.url.startsWith('idb://')) {
      const fileId = attachment.url.replace('idb://', '');
      import('../../lib/idb').then(({ getFile }) => {
        getFile(fileId).then(data => {
          if (data && data.file) {
            objectUrl = URL.createObjectURL(data.file);
            setLocalUrl(objectUrl);
          }
        }).catch(err => console.error("Error getting idb file:", err));
      });
    }
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [attachment.url]);

  const displayUrl = localUrl || attachment.url;

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowConfirmDelete(true);
  };

  const confirmDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      if (attachment.url.startsWith('idb://')) {
        const fileId = attachment.url.replace('idb://', '');
        import('../../lib/idb').then(({ deleteFileLocal }) => deleteFileLocal(fileId)).catch(console.error);
      }
      const db = getFirestore();
      const taskRef = doc(db, 'projects', projectId, 'tasks', taskId);
      await updateDoc(taskRef, {
        attachments: arrayRemove(attachment)
      });                
      toast('File deleted successfully', 'success');
    } catch(e) {
      console.error(e);
      toast('Failed to delete file', 'error');
    }
  };

  const renderIcon = () => {
    switch (attachment.type) {
      case 'file': return <FileText className="w-8 h-8 text-slate-400 mb-2" />;
      default: return <FileText className="w-8 h-8 text-slate-400 mb-2" />;
    }
  };

  if (attachment.type === 'link' && attachment.linkMetadata) {
    return (
      <div className="group relative border border-brand-border/60 rounded-xl overflow-hidden bg-brand-surface hover:border-brand-accent/40 shadow-sm transition-all flex flex-col h-32">
        <a href={attachment.url} target="_blank" rel="noreferrer" className="flex-1 flex flex-col">
          {attachment.linkMetadata.image ? (
            <div 
              className="w-full h-16 bg-cover bg-center border-b border-brand-border/50" 
              style={{ backgroundImage: `url(${attachment.linkMetadata.image})` }} 
            />
          ) : (
             <div className="w-full h-16 bg-brand-surface-hover/50 flex items-center justify-center border-b border-brand-border/50 text-emerald-500/50">
               <LinkIcon className="w-6 h-6" />
             </div>
          )}
          <div className="flex-1 px-3 py-2 flex items-center gap-2">
            {attachment.linkMetadata.favicon ? (
               <img src={attachment.linkMetadata.favicon} className="w-4 h-4 rounded-sm shrink-0" alt="icon" />
            ) : (
               <LinkIcon className="w-4 h-4 text-brand-text-muted shrink-0" />
            )}
            <div className="flex-1 min-w-0">
               <p className="text-[11px] font-bold text-brand-text-main truncate" title={attachment.linkMetadata.title || attachment.url}>
                 {attachment.linkMetadata.title || 'Link'}
               </p>
               <p className="text-[10px] text-brand-text-muted truncate">
                 {(() => {
                   try {
                     return new URL(attachment.url).hostname.replace('www.', '');
                   } catch {
                     return attachment.url;
                   }
                 })()}
               </p>
            </div>
          </div>
        </a>
        {!readOnly && (
           <button
             onClick={handleDelete}
             className="absolute top-2 right-2 p-1.5 bg-brand-surface shadow-sm border border-brand-border rounded-lg text-red-500 opacity-0 group-hover:opacity-100 hover:bg-red-50 dark:hover:bg-red-500/10 hover:scale-105 transition-all"
           >
             <Trash2 className="w-3.5 h-3.5" />
           </button>
        )}
      </div>
    );
  }

  return (
    <>
      <div className="group relative border border-brand-border/60 rounded-xl overflow-hidden bg-brand-surface hover:border-brand-accent/40 transition-all shadow-sm h-32 flex flex-col">
        {attachment.type === 'image' ? (
          <div 
            className="w-full h-full cursor-pointer overflow-hidden relative bg-gray-100"
            onClick={() => setIsFullscreen(true)}
          >
            {displayUrl && (
              <img 
                src={displayUrl} 
                alt={attachment.name} 
                className="w-full h-full object-cover select-none group-hover:scale-105 transition-transform duration-500" 
              />
            )}
            {/* Image overlay to indicate clickable */}
            <div className="absolute inset-0 bg-white/0 group-hover:bg-brand-surface-hover/20 transition-colors" />
          </div>
        ) : attachment.type === 'video' ? (
           <div className="w-full h-full bg-gray-100">
              {displayUrl && <video src={displayUrl} controls className="w-full h-full object-cover" />}
           </div>
        ) : attachment.type === 'audio' ? (
           <div className="w-full h-full flex flex-col items-center justify-center bg-brand-surface-hover/30 p-2">
              <Music className="w-6 h-6 text-amber-400/80 mt-1 mb-2" />
              {displayUrl && <audio src={displayUrl} controls className="w-full h-8 scale-90 origin-bottom" />}
           </div>
        ) : (
          <div className="flex flex-col items-center justify-center flex-1 p-3 text-center bg-brand-surface-hover/20">
            {renderIcon()}
            <span className="text-[11px] font-medium text-brand-text-main line-clamp-2 w-full break-all" title={attachment.name}>
              {attachment.name}
            </span>
            <span className="text-[10px] text-brand-text-muted mt-1 uppercase tracking-wider">{attachment.name.split('.').pop()}</span>
          </div>
        )}
        
        {/* Actions Overlay */}
        <div className="absolute top-2 right-2 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <a 
            href={displayUrl || '#'} 
            target="_blank" 
            rel="noreferrer" 
            onClick={(e) => e.stopPropagation()}
            className="p-1.5 bg-brand-surface shadow-sm border border-brand-border rounded-lg text-brand-text-main hover:bg-brand-surface-hover hover:scale-105 transition-all backdrop-blur-md"
            download={attachment.type !== 'link'}
            title="Download"
          >
            <Download className="w-3.5 h-3.5" />
          </a>
          {!readOnly && (
            <button
              onClick={handleDelete}
              className="p-1.5 bg-brand-surface shadow-sm border border-brand-border rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 hover:scale-105 transition-all backdrop-blur-md"
              title="Delete"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {showConfirmDelete && (
          <div className="absolute inset-0 z-30 surface-backdrop flex flex-col items-center justify-center p-3 animate-in fade-in zoom-in-95 duration-200">
             <p className="text-white font-bold text-xs mb-3 text-center">Delete file?</p>
             <div className="flex items-center gap-2">
               <button 
                 onClick={(e) => { e.stopPropagation(); setShowConfirmDelete(false); }}
                 className="px-3 py-1.5 rounded-md text-[10px] font-bold text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-white/10 hover:bg-gray-200 dark:hover:bg-white/20 transition-colors"
               >
                 Cancel
               </button>
               <button 
                 onClick={confirmDelete}
                 className="px-3 py-1.5 rounded-md text-[10px] font-bold text-white bg-red-500 hover:bg-red-600 transition-colors"
               >
                 Delete
               </button>
             </div>
          </div>
        )}
      </div>

      {isFullscreen && attachment.type === 'image' && createPortal(
        <div 
          className="fixed inset-0 z-[999] flex items-center justify-center surface-backdrop"
          onClick={() => setIsFullscreen(false)}
        >
           <button 
             className="absolute top-6 right-6 p-3 rounded-full bg-brand-surface border border-brand-border shadow-sm hover:bg-brand-surface-hover text-brand-text-main transition-colors"
             onClick={(e) => { e.stopPropagation(); setIsFullscreen(false); }}
           >
             <X className="w-6 h-6" />
           </button>
           <img 
             src={displayUrl || attachment.url} 
             alt={attachment.name} 
             className="max-w-[90vw] max-h-[90vh] object-contain select-none animate-in fade-in zoom-in-95 duration-200" 
             onClick={(e) => e.stopPropagation()}
           />
        </div>,
        document.body
      )}
    </>
  );
};


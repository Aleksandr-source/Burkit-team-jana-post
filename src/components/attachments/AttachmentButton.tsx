import React, { useState } from 'react';
import { Paperclip } from 'lucide-react';
import { AttachmentModal } from './AttachmentModal';

export const AttachmentButton = ({ projectId, taskId }: { projectId: string; taskId: string }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div 
      data-no-open="true" 
      onClick={(e) => e.stopPropagation()} 
      onPointerDown={(e) => e.stopPropagation()}
    >
      <button 
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsOpen(true);
        }}
        className="p-1.5 hover:bg-neutral-100 rounded-lg text-slate-400 hover:text-brand-text-main transition-all"
        title="Attach files"
      >
        <Paperclip className="w-4 h-4" />
      </button>
      {isOpen && <AttachmentModal projectId={projectId} taskId={taskId} onClose={() => setIsOpen(false)} />}
    </div>
  );
};

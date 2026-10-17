import React from 'react';
import { X } from 'lucide-react';

interface FilterPillProps {
  label: string;
  onRemove: () => void;
}

export function FilterPill({ label, onRemove }: FilterPillProps) {
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-brand-accent/10 text-brand-accent">
      {label}
      <button 
        onClick={onRemove}
        className="p-0.5 hover:bg-brand-accent/20 rounded-full transition-colors ml-0.5 -mr-1"
      >
        <X className="w-3 h-3" />
      </button>
    </span>
  );
}

import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { createPortal } from 'react-dom';
import { cn } from '../../lib/utils';

export interface SelectOption {
  value: string;
  label: string;
  icon?: React.ReactNode;
}

interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  dropdownClassName?: string;
  prefix?: React.ReactNode;
}

export function Select({
  value,
  onChange,
  options,
  placeholder = 'Select...',
  disabled = false,
  className,
  dropdownClassName,
  prefix,
}: SelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number; width: number; bottom: number } | null>(null);

  const selectedOption = options.find((opt) => opt.value === value);

  useEffect(() => {
    if (isOpen && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setCoords({
        top: rect.bottom + 6,
        left: rect.left,
        width: rect.width,
        bottom: window.innerHeight - rect.bottom,
      });
    }
  }, [isOpen]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current && 
        !dropdownRef.current.contains(event.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={cn(
          "flex items-center justify-between w-full px-3 py-2.5 text-[13px] text-left bg-card text-foreground border border-border rounded-[10px] shadow-sm transition-all outline-none group",
          disabled ? "opacity-50 cursor-not-allowed bg-black/5 dark:bg-white/5" : "hover:border-gray-300 dark:hover:border-white/20 focus:ring-2 focus:ring-[#EEF2FF] dark:focus:ring-brand-accent/20 focus:border-[#4F7CFF]",
          isOpen ? "border-[#4F7CFF] ring-2 ring-[#EEF2FF] dark:ring-brand-accent/20" : "border-border",
          className
        )}
      >
        <span className="flex items-center gap-2.5 truncate flex-1 pr-2">
          {prefix && <span className="shrink-0">{prefix}</span>}
          {selectedOption ? (
            <div className="flex items-center gap-2 truncate">
              {selectedOption.icon && <span className="shrink-0">{selectedOption.icon}</span>}
              <span className="text-foreground font-medium truncate">{selectedOption.label}</span>
            </div>
          ) : (
            <span className="text-gray-400 font-medium">{placeholder}</span>
          )}
        </span>
        <ChevronDown 
          className={cn(
            "w-4 h-4 text-gray-400 transition-transform duration-200 shrink-0",
            isOpen ? "rotate-180 text-gray-600" : "group-hover:text-gray-500"
          )} 
        />
      </button>

      {isOpen && coords && createPortal(
        <div
          ref={dropdownRef}
          style={{
            position: 'fixed',
            top: coords.bottom < 200 ? 'auto' : coords.top,
            bottom: coords.bottom < 200 ? window.innerHeight - coords.top + 16 : 'auto',
            left: coords.left,
            width: coords.width,
            zIndex: 99999,
          }}
          className={cn(
            "dropdown rounded-[12px] overflow-hidden flex flex-col py-1.5",
            dropdownClassName
          )}
        >
          <div className="max-h-[240px] overflow-y-auto custom-scrollbar outline-none flex flex-col px-1.5">
            {options.map((opt) => {
              const isSelected = opt.value === value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    onChange(opt.value);
                    setIsOpen(false);
                  }}
                  className={cn(
                    "flex items-center justify-between w-full px-2.5 py-2 text-[13px] text-left transition-colors outline-none rounded-[8px]",
                    isSelected 
                      ? "bg-blue-50 dark:bg-blue-500/20 text-blue-600 dark:text-blue-300" 
                      : "text-foreground hover:bg-gray-100 dark:hover:bg-white/10"
                  )}
                >
                  <div className="flex items-center gap-2.5 truncate">
                    {opt.icon && <span className="shrink-0">{opt.icon}</span>}
                    <span className={cn("truncate", isSelected ? "font-semibold" : "font-medium")}>
                      {opt.label}
                    </span>
                  </div>
                  {isSelected && <Check className="w-3.5 h-3.5 shrink-0 text-[#4F7CFF] ml-2" />}
                </button>
              );
            })}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

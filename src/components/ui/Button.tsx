import React from 'react';
import { cn } from '../../lib/utils';
import { motion, HTMLMotionProps } from 'motion/react';

export interface ButtonProps extends Omit<HTMLMotionProps<"button">, "ref" | "children"> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  children?: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = 'primary',
      size = 'md',
      fullWidth = false,
      leftIcon,
      rightIcon,
      children,
      ...props
    },
    ref
  ) => {
    const variants = {
      primary: 'bg-brand-accent text-white hover:opacity-90 shadow-sm hover:shadow-md border border-transparent',
      secondary: 'bg-brand-surface text-brand-text-main border border-brand-border hover:border-brand-border hover:bg-brand-surface-hover shadow-sm',
      ghost: 'bg-transparent text-brand-text-muted hover:text-brand-text-main hover:bg-neutral-100',
      danger: 'bg-red-50 text-red-600 border border-red-100 hover:bg-red-100 hover:border-red-200'
    };

    const sizes = {
      sm: 'h-8 px-3 text-xs gap-1.5 rounded-lg',
      md: 'h-10 px-4 text-sm gap-2 rounded-xl',
      lg: 'h-11 px-5 text-base gap-2 rounded-xl'
    };

    return (
      <motion.button
        ref={ref}
        whileTap={{ scale: 0.98 }}
        className={cn(
          'inline-flex items-center justify-center font-semibold transition-all duration-200 ease-in-out cursor-pointer',
          variants[variant],
          sizes[size],
          fullWidth && 'w-full',
          className
        )}
        {...props}
      >
        {leftIcon && <span className="flex items-center shrink-0">{leftIcon}</span>}
        {children}
        {rightIcon && <span className="flex items-center shrink-0">{rightIcon}</span>}
      </motion.button>
    );
  }
);
Button.displayName = 'Button';

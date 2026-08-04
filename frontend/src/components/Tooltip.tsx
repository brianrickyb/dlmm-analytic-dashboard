import { useId, useState, type ReactNode } from 'react';
import { glossary } from '../content/glossary';

interface TooltipProps {
  termKey: string;
  children: ReactNode;
}

export function Tooltip({ termKey, children }: TooltipProps) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const entry = glossary.find((e) => e.key === termKey);

  if (!entry) {
    return <>{children}</>;
  }

  return (
    <span className="relative inline-block">
      <span
        className="cursor-help border-b border-dotted"
        style={{ borderColor: 'var(--text-muted)' }}
        tabIndex={0}
        role="button"
        aria-describedby={id}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </span>
      {open ? (
        <span
          id={id}
          role="tooltip"
          className="absolute bottom-full left-1/2 z-10 mb-1 w-56 -translate-x-1/2 rounded border p-2 text-left text-xs font-normal normal-case shadow-sm"
          style={{ borderColor: 'var(--border)', background: 'var(--surface-1)', color: 'var(--text-secondary)' }}
        >
          {entry.shortDefinition}
        </span>
      ) : null}
    </span>
  );
}

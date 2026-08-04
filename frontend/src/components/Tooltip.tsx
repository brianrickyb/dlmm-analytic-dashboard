import { useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { glossary } from '../content/glossary';

interface TooltipProps {
  termKey: string;
  children: ReactNode;
}

export function Tooltip({ termKey, children }: TooltipProps) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLSpanElement>(null);
  const id = useId();
  const entry = glossary.find((e) => e.key === termKey);

  if (!entry) {
    return <>{children}</>;
  }

  function show() {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) {
      setCoords({ top: rect.top, left: rect.left + rect.width / 2 });
    }
    setOpen(true);
  }

  function hide() {
    setOpen(false);
  }

  return (
    <span className="relative inline-block">
      <span
        ref={triggerRef}
        className="cursor-help border-b border-dotted"
        style={{ borderColor: 'var(--text-muted)' }}
        tabIndex={0}
        role="button"
        aria-describedby={id}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </span>
      {open
        ? createPortal(
            <span
              id={id}
              role="tooltip"
              className="fixed z-50 -translate-x-1/2 -translate-y-full w-56 rounded border p-2 text-left text-xs font-normal normal-case shadow-sm"
              style={{
                top: coords.top - 8,
                left: coords.left,
                borderColor: 'var(--border)',
                background: 'var(--surface-1)',
                color: 'var(--text-secondary)',
              }}
            >
              {entry.shortDefinition}
            </span>,
            document.body,
          )
        : null}
    </span>
  );
}

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { glossary } from '../content/glossary';

const POPOVER_WIDTH = 224; // px, matches w-56
const POPOVER_HEIGHT = 80; // px, approx height budget used to decide whether to flip below
const VIEWPORT_MARGIN = 8;

interface TooltipProps {
  termKey: string;
  children: ReactNode;
}

export function Tooltip({ termKey, children }: TooltipProps) {
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState({ top: 0, left: 0, flip: false });
  const triggerRef = useRef<HTMLSpanElement>(null);
  const id = useId();
  const entry = glossary.find((e) => e.key === termKey);

  useEffect(() => {
    if (!open) return;
    function close() {
      setOpen(false);
    }
    window.addEventListener('scroll', close, { capture: true });
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', close, { capture: true });
      window.removeEventListener('resize', close);
    };
  }, [open]);

  if (!entry) {
    return <>{children}</>;
  }

  function show() {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) {
      const half = POPOVER_WIDTH / 2;
      const left = Math.min(
        Math.max(rect.left + rect.width / 2, half + VIEWPORT_MARGIN),
        window.innerWidth - half - VIEWPORT_MARGIN,
      );
      const flip = rect.top < POPOVER_HEIGHT + VIEWPORT_MARGIN;
      setPlacement({ top: flip ? rect.bottom : rect.top, left, flip });
    }
    setOpen(true);
  }

  function hide() {
    setOpen(false);
  }

  return (
    <span className="inline-block">
      <span
        ref={triggerRef}
        className="cursor-help border-b border-dotted"
        style={{ borderColor: 'var(--text-muted)' }}
        tabIndex={0}
        aria-describedby={open ? id : undefined}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        onKeyDown={(e) => {
          if (e.key === 'Escape') hide();
        }}
      >
        {children}
      </span>
      {open
        ? createPortal(
            <span
              id={id}
              role="tooltip"
              className={`fixed z-50 w-56 -translate-x-1/2 rounded border p-2 text-left text-xs font-normal normal-case shadow-sm ${
                placement.flip ? '' : '-translate-y-full'
              }`}
              style={{
                top: placement.flip ? placement.top + 8 : placement.top - 8,
                left: placement.left,
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

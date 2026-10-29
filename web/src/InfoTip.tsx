import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

// A small (i) button that shows an explanation on hover or keyboard focus.
// The popover is fixed-positioned so a scrolling table can't clip it.
export function InfoTip({ label, children }: { label: string; children: ReactNode }) {
  const id = useId();
  const button = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useLayoutEffect(() => {
    if (!open || !button.current) return;
    const r = button.current.getBoundingClientRect();
    const width = 280;
    setPos({ top: r.bottom + 8, left: Math.max(16, Math.min(r.left + r.width / 2 - width / 2, window.innerWidth - width - 16)) });
  }, [open]);

  return (
    <>
      <button
        ref={button}
        type="button"
        aria-label={`What is ${label}?`}
        aria-describedby={open ? id : undefined}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
        className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full border border-stone-400 align-[-2px] text-[10px] font-semibold normal-case leading-none text-stone-500 hover:border-accent-ink hover:text-accent-ink focus-visible:outline-2 focus-visible:outline-accent"
      >
        i
      </button>
      {open && (
        <span
          id={id}
          role="tooltip"
          style={{ top: pos.top, left: pos.left, width: 280 }}
          className="fixed z-50 whitespace-normal rounded-xl bg-ink px-3 py-2 text-left text-xs font-normal normal-case leading-relaxed tracking-normal text-white shadow-lg"
        >
          {children}
        </span>
      )}
    </>
  );
}

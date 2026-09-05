"use client";

import * as React from "react";
import { X } from "lucide-react";

export function Dialog({ open, onClose, title, children }: {
  open: boolean; onClose: () => void; title: string; children: React.ReactNode;
}) {
  const ref = React.useRef<HTMLDialogElement>(null);
  const titleId = React.useId();
  React.useEffect(() => {
    const element = ref.current;
    if (open && element && !element.open) element.showModal();
    if (!open && element?.open) element.close();
  }, [open]);
  return <dialog ref={ref} aria-labelledby={titleId} className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-xl border-0 bg-white p-0 shadow-xl backdrop:bg-black/50"
    onCancel={event => { event.preventDefault(); onClose(); }}
    onMouseDown={event => {
      if (event.target !== event.currentTarget) return;
      const box = event.currentTarget.getBoundingClientRect();
      if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) onClose();
    }}>
    <div className="flex items-center justify-between border-b border-slate-200 p-4">
      <h3 id={titleId} className="text-lg font-semibold text-slate-900">{title}</h3>
      <button type="button" onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label="Close"><X className="h-5 w-5"/></button>
    </div>
    <div className="max-h-[70vh] overflow-y-auto p-4">{children}</div>
  </dialog>;
}

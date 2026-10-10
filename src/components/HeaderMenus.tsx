"use client";

import { useState, type ReactNode } from "react";
import type { TodoList } from "@/lib/types";
import type { useInboxFilter } from "@/lib/use-inbox-filter";

// A button that opens a dropdown on desktop and a bottom sheet on phones.
function Popover({ label, active, children }: { label: string; active?: boolean; children: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  return (
    <div className="relative flex-shrink-0">
      <button
        onClick={() => setOpen(!open)}
        className={`text-sm px-2 py-1.5 ${active ? "text-accent" : "text-text-muted hover:text-text-normal"}`}
      >
        {label}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40 bg-black/40 md:bg-transparent" onClick={close} />
          <div
            className="fixed inset-x-0 bottom-0 z-50 max-h-[70%] overflow-y-auto bg-background-secondary border-t border-border
                       pb-[env(safe-area-inset-bottom)]
                       md:absolute md:inset-auto md:right-0 md:top-full md:mt-1 md:w-72 md:border md:max-h-96 md:shadow-lg md:pb-0"
          >
            {children(close)}
          </div>
        </>
      )}
    </div>
  );
}

const item = "w-full text-left px-4 py-3 md:px-3 md:py-2 text-sm hover:bg-background-tertiary active:bg-background-tertiary";

export function CopyMenu({ onCopy }: { onCopy: (format: "markdown" | "json") => Promise<boolean> }) {
  const [copied, setCopied] = useState(false);
  const copy = async (format: "markdown" | "json", close: () => void) => {
    close();
    if (await onCopy(format)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };
  return (
    <Popover label={copied ? "copied!" : "copy"} active={copied}>
      {(close) => (
        <>
          <button onClick={() => copy("markdown", close)} className={item}>Copy as Markdown</button>
          <button onClick={() => copy("json", close)} className={item}>Copy as JSON</button>
        </>
      )}
    </Popover>
  );
}

export function FilterMenu({ lists, inbox }: { lists: TodoList[]; inbox: ReturnType<typeof useInboxFilter> }) {
  const { filter, selected } = inbox;
  const modeButton = (mode: typeof filter.mode, label: string) => (
    <button
      onClick={() => inbox.setMode(mode)}
      className={`px-2 py-1.5 ${filter.mode === mode ? "text-accent bg-accent/10" : "text-text-muted hover:text-text-normal"}`}
    >
      {label}
    </button>
  );
  return (
    <Popover label={selected.length ? `filter (${selected.length})` : "filter"} active={selected.length > 0}>
      {() => (
        <>
          <div className="p-3 border-b border-border flex gap-2 text-xs">
            {modeButton("blacklist", "Hide selected")}
            {modeButton("whitelist", "Show only selected")}
          </div>
          {lists.map((list) => {
            const on = selected.includes(list.id);
            return (
              <button key={list.id} onClick={() => inbox.toggle(list.id)} className={`${item} flex items-center gap-3`}>
                <span className={`w-4 text-center ${on ? "text-accent" : "text-text-faint"}`}>{on ? "x" : "-"}</span>
                <span className="truncate flex-1">{list.name}</span>
                <span className="text-xs text-text-faint">{list.itemCount}</span>
              </button>
            );
          })}
          {selected.length > 0 && (
            <button onClick={inbox.clear} className="w-full p-3 border-t border-border text-xs text-text-muted hover:text-accent">
              Clear filter
            </button>
          )}
        </>
      )}
    </Popover>
  );
}

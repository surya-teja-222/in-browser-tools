import { type DragEvent, type ReactNode, useRef, useState } from "react";
import { cn } from "@/lib/cn";

interface FileDropProps {
  /** Called with the dropped or picked files. Files are read locally; nothing is uploaded. */
  onFiles: (files: File[]) => void;
  /** Passed to the hidden <input type="file">, e.g. ".json,application/json". */
  accept?: string;
  multiple?: boolean;
  className?: string;
  /** Render prop receives `open` to show the file picker, and whether a drag is over the area. */
  children: (api: { open: () => void; dragging: boolean }) => ReactNode;
}

/** Drop target plus file picker. Wrap any region of a tool to accept dropped files. */
export function FileDrop({ onFiles, accept, multiple, className, children }: FileDropProps) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    const files = [...e.dataTransfer.files];
    if (files.length) onFiles(multiple ? files : files.slice(0, 1));
  }

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: drop target only; the picker button inside is the accessible path.
    <div
      className={cn("relative", className)}
      data-dragging={dragging || undefined}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false);
      }}
      onDrop={onDrop}
    >
      {children({ open: () => input.current?.click(), dragging })}
      <input
        ref={input}
        type="file"
        hidden
        accept={accept}
        multiple={multiple}
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          if (files.length) onFiles(files);
          e.target.value = "";
        }}
      />
    </div>
  );
}

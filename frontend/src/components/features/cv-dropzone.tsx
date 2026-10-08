"use client";

import { FileText, Upload, X } from "lucide-react";
import { useRef, useState } from "react";
import { checkCv } from "@/lib/schemas";
import { cn } from "@/lib/utils";

export function CvDropzone({
  file,
  onChange,
  error,
}: {
  file: File | null;
  onChange: (file: File | null) => void;
  error?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [localError, setLocalError] = useState("");

  function choose(next: File | undefined) {
    if (!next) return;
    const problem = checkCv(next);
    setLocalError(problem ?? "");
    onChange(problem ? null : next);
  }

  const message = localError || error;

  return (
    <div className="flex flex-col gap-1.5">
      <input
        ref={inputRef}
        id="cv"
        type="file"
        accept=".pdf,.doc,.docx"
        className="sr-only"
        onChange={(event) => choose(event.target.files?.[0])}
      />
      {file ? (
        <div className="flex items-center gap-3 rounded-md border bg-card p-3">
          <FileText className="size-5 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{file.name}</p>
            <p className="text-xs text-muted-foreground">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
          </div>
          <button type="button" aria-label="Remove CV" className="rounded p-1 hover:bg-muted" onClick={() => onChange(null)}>
            <X className="size-4" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            choose(event.dataTransfer.files[0]);
          }}
          className={cn(
            "flex flex-col items-center gap-1 rounded-md border-2 border-dashed px-4 py-8 text-center transition-colors hover:border-primary hover:bg-accent/50",
            dragging && "border-primary bg-accent/50",
          )}
        >
          <Upload className="size-5 text-primary" />
          <span className="text-sm font-semibold">Drop your CV here or browse</span>
          <span className="text-xs text-muted-foreground">PDF, DOC or DOCX, up to 5 MB</span>
        </button>
      )}
      {message && (
        <p role="alert" className="text-xs font-medium text-destructive">
          {message}
        </p>
      )}
    </div>
  );
}

import * as React from "react";
import { cn } from "@/lib/utils";

const fieldStyle =
  "w-full rounded-md border border-input bg-card px-3 text-sm placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/25 disabled:opacity-50";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => <input ref={ref} className={cn(fieldStyle, "h-10", className)} {...props} />,
);
Input.displayName = "Input";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => <textarea ref={ref} className={cn(fieldStyle, "min-h-24 py-2", className)} {...props} />,
);
Textarea.displayName = "Textarea";

// A native select keeps keyboard and mobile behaviour correct with no extra code.
export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, ...props }, ref) => <select ref={ref} className={cn(fieldStyle, "h-10", className)} {...props} />,
);
Select.displayName = "Select";

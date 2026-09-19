import type { HTMLAttributes } from "react";

import { cn } from "./cn";

// Semantic status system: default/secondary/outline read as neutral, info/success/warning/
// destructive map to the spec's Information/Success/Warning/Critical states. Colors stay
// restrained (tinted backgrounds, not solid fills) so a list of badges never reads as noisy.
export type BadgeVariant =
  "default" | "secondary" | "outline" | "info" | "success" | "warning" | "destructive";

const variantClasses: Record<BadgeVariant, string> = {
  default: "bg-primary text-primary-foreground",
  secondary: "bg-secondary text-secondary-foreground",
  outline: "border border-border text-foreground",
  info: "bg-info/10 text-info",
  success: "bg-success/10 text-success",
  warning: "bg-warning/15 text-warning-foreground",
  destructive: "bg-destructive/10 text-destructive",
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

export function Badge({ variant = "default", className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium",
        variantClasses[variant],
        className,
      )}
      {...props}
    />
  );
}

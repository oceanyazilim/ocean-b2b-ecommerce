import type { HTMLAttributes } from "react";

import { cn } from "./cn";

export type AlertVariant = "info" | "success" | "warning" | "error";

export interface AlertProps extends HTMLAttributes<HTMLDivElement> {
  variant?: AlertVariant;
  title?: string;
}

const variantClasses: Record<AlertVariant, string> = {
  info: "border-border bg-muted text-foreground",
  success: "border-success/40 bg-success/10 text-foreground",
  warning: "border-warning/50 bg-warning/10 text-foreground",
  error: "border-destructive/40 bg-destructive/10 text-foreground",
};

export function Alert({ variant = "info", title, className, children, ...props }: AlertProps) {
  return (
    <div
      role={variant === "error" ? "alert" : "status"}
      className={cn("rounded-md border px-4 py-3 text-sm", variantClasses[variant], className)}
      {...props}
    >
      {title && <p className="mb-1 font-medium">{title}</p>}
      <div>{children}</div>
    </div>
  );
}

import { type VariantProps, cva } from "class-variance-authority";
import { cn } from "@/renderer/lib/utils";
import * as React from "react";

export type BadgeVariant =
  | "default"
  | "secondary"
  | "destructive"
  | "violet"
  | "rose"
  | "blue"
  | "green"
  | "orange"
  | "zinc"
  | "outline";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground hover:bg-primary/80",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive:
          "border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80",
        violet: "border-transparent bg-violet text-violet-foreground hover:bg-violet/80",
        rose: "border-transparent bg-rose text-rose-foreground hover:bg-rose/80",
        blue: "border-transparent bg-blue text-blue-foreground hover:bg-blue/80",
        green: "border-transparent bg-green text-green-foreground hover:bg-green/80",
        orange: "border-transparent bg-orange text-orange-foreground hover:bg-orange/80",
        zinc: "border-transparent bg-zinc text-zinc-foreground hover:bg-zinc/80",
        outline: "text-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };

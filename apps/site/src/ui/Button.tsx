import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

const buttonVariants = cva(
  "inline-flex h-9 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-control px-3.5 text-sm font-medium transition-[background-color,color,transform] duration-150 active:translate-y-px disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4.5 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-sun text-on-sun hover:brightness-95",
        secondary: "border border-rule bg-surface text-ink hover:border-ink-muted",
        ghost: "text-ink-muted hover:bg-surface hover:text-ink",
      },
    },
    defaultVariants: { variant: "secondary" },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export function Button({ className, variant, type = "button", ...props }: ButtonProps) {
  return <button type={type} className={cn(buttonVariants({ variant }), className)} {...props} />;
}

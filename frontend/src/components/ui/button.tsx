import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

export const buttonVariants = cva("voyager-button", {
  variants: {
    variant: {
      default: "voyager-button--primary",
      primary: "voyager-button--primary",
      secondary: "voyager-button--secondary",
      quiet: "voyager-button--quiet",
      ghost: "voyager-button--quiet",
      outline: "voyager-button--outline",
      danger: "voyager-button--danger",
      destructive: "voyager-button--danger",
      link: "voyager-button--link",
    },
    size: {
      default: "voyager-button--default",
      sm: "voyager-button--small",
      lg: "voyager-button--large",
      icon: "voyager-button--icon",
    },
  },
  defaultVariants: { variant: "default", size: "default" },
});

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants>;

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, type = "button", ...props },
  ref,
) {
  return <button ref={ref} type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
});
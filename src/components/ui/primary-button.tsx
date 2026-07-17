import type { ButtonHTMLAttributes } from "react";

export function PrimaryButton({
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`rounded-full bg-sage px-4 py-2 text-[14.5px] font-bold text-white shadow-card transition-[filter,transform] duration-150 hover:brightness-[1.06] active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100 ${className}`}
    />
  );
}

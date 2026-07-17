import type { InputHTMLAttributes } from "react";

interface TextInputProps extends InputHTMLAttributes<HTMLInputElement> {
  focusColor?: "sage" | "amber";
}

const focusRing = {
  sage: "focus:border-sage focus:outline-sage",
  amber: "focus:border-amber focus:outline-amber",
};

export function TextInput({
  focusColor = "sage",
  className = "",
  ...props
}: TextInputProps) {
  return (
    <input
      {...props}
      className={`rounded-[10px] border border-line-strong bg-paper-raised px-3 py-2 text-[13.5px] text-ink placeholder:text-line-strong placeholder:italic focus:outline focus:outline-2 focus:outline-offset-1 disabled:cursor-not-allowed disabled:border-line disabled:text-line-strong ${focusRing[focusColor]} ${className}`}
    />
  );
}

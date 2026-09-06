import type { ReactNode } from "react";

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-[10px] border border-rule bg-paper p-7 sm:p-9 ${className}`}
    >
      {children}
    </div>
  );
}

export function Button({
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className="rounded-md bg-maroon px-5 py-2.5 text-sm text-cream transition-colors duration-200 hover:bg-brick active:scale-[0.98] disabled:opacity-40"
    >
      {children}
    </button>
  );
}

export function QuietButton({
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className="rounded-md border border-rule bg-transparent px-4 py-2 text-sm text-umber transition-colors duration-200 hover:border-rule-strong hover:text-maroon"
    >
      {children}
    </button>
  );
}

export function Tag({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full border border-rule px-2.5 py-0.5 text-[0.65rem] uppercase tracking-[0.09em] text-umber">
      {children}
    </span>
  );
}

export function Notice({
  children,
  tone = "warn",
}: {
  children: ReactNode;
  tone?: "warn" | "info";
}) {
  const toneClass =
    tone === "warn"
      ? "border-maroon/25 text-maroon"
      : "border-rule text-umber";
  return (
    <p className={`rounded-md border px-3.5 py-2.5 text-sm ${toneClass}`} role="status">
      {children}
    </p>
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label>{label}</label>
      {children}
    </div>
  );
}

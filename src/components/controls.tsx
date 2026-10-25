"use client";

import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { useId } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-forest-600 text-white border-forest-700 hover:bg-forest-700 active:bg-forest-800",
  secondary:
    "bg-paper-raised text-ink border-line-strong hover:bg-paper-sunken",
  ghost: "bg-transparent text-forest-600 border-transparent hover:bg-mint-soft",
  danger: "bg-clay-soft text-clay border-[#dba991] hover:bg-[#f2dad0]",
};

export function Button({
  children,
  variant = "primary",
  size = "md",
  loading = false,
  className = "",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: "sm" | "md";
  loading?: boolean;
}) {
  return (
    <button
      {...rest}
      aria-busy={loading || undefined}
      disabled={rest.disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded-lg border font-semibold transition-colors ${
        size === "sm" ? "px-3 py-1.5 text-sm" : "px-4 py-2 text-sm"
      } ${VARIANTS[variant]} ${className}`}
    >
      {loading ? (
        <span
          aria-hidden="true"
          className="lp-spin inline-block h-3.5 w-3.5 rounded-full border-2 border-current border-t-transparent"
        />
      ) : null}
      {children}
    </button>
  );
}

export function Field({
  label,
  hint,
  error,
  required,
  children,
  htmlFor,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  required?: boolean;
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-semibold text-ink">
        {label}
        {required ? (
          <span className="ml-1 text-clay" title="Required">
            *
          </span>
        ) : (
          <span className="ml-1.5 text-xs font-normal text-ink-muted">optional</span>
        )}
      </label>
      {hint ? <p className="text-xs leading-snug text-ink-muted">{hint}</p> : null}
      {children}
      {error ? (
        <p role="alert" className="text-xs font-semibold text-clay">
          {error}
        </p>
      ) : null}
    </div>
  );
}

const inputClasses =
  "w-full rounded-lg border border-line-strong bg-paper-raised px-3 py-2 text-sm shadow-inner shadow-black/[0.02] placeholder:text-ink-muted focus:border-forest-400";

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${inputClasses} ${props.className ?? ""}`} />;
}

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${inputClasses} min-h-24 ${props.className ?? ""}`} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${inputClasses} pr-8 ${props.className ?? ""}`} />;
}

export function LabelledField({
  label,
  hint,
  error,
  required,
  render,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  required?: boolean;
  render: (id: string) => ReactNode;
}) {
  const id = useId();
  return (
    <Field label={label} hint={hint} error={error} required={required} htmlFor={id}>
      {render(id)}
    </Field>
  );
}

export function Checkbox({
  label,
  hint,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode; hint?: ReactNode }) {
  const id = useId();
  return (
    <div className="flex gap-2.5">
      <input
        {...rest}
        id={rest.id ?? id}
        type="checkbox"
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-line-strong accent-forest-600"
      />
      <label htmlFor={rest.id ?? id} className="text-sm text-ink">
        {label}
        {hint ? <span className="block text-xs text-ink-muted">{hint}</span> : null}
      </label>
    </div>
  );
}

export function RadioGroup<T extends string>({
  legend,
  name,
  value,
  options,
  onChange,
  hint,
}: {
  legend: ReactNode;
  name: string;
  value: T;
  options: Array<{ value: T; label: string; description?: string }>;
  onChange: (value: T) => void;
  hint?: ReactNode;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-semibold text-ink">{legend}</legend>
      {hint ? <p className="text-xs leading-snug text-ink-muted">{hint}</p> : null}
      <div className="space-y-1.5">
        {options.map((option) => (
          <label
            key={option.value}
            className="flex cursor-pointer gap-2.5 rounded-lg border border-line bg-paper-raised px-3 py-2 has-checked:border-forest-400 has-checked:bg-mint-soft"
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              className="mt-1 h-4 w-4 shrink-0 accent-forest-600"
            />
            <span className="text-sm">
              <span className="font-medium text-ink">{option.label}</span>
              {option.description ? (
                <span className="block text-xs text-ink-muted">{option.description}</span>
              ) : null}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

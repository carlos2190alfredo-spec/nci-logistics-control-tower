import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const controlStyles =
  "min-h-10 w-full rounded-lg border border-border bg-surface px-3 py-2 text-foreground shadow-xs transition-colors duration-150 placeholder:text-faint-foreground hover:border-border-strong focus:border-primary";

function fieldId(name: string) {
  return `field-${name}`;
}

function FieldShell({
  label,
  name,
  required,
  help,
  children,
  className,
}: {
  label: string;
  name: string;
  required?: boolean;
  help?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("grid gap-1.5", className)}>
      <label className="text-sm font-medium text-foreground" htmlFor={fieldId(name)}>
        {label}
        {required ? (
          <span aria-hidden className="ml-0.5 text-danger">
            *
          </span>
        ) : null}
      </label>
      {children}
      {help ? (
        <p className="text-xs text-muted-foreground" id={`${fieldId(name)}-help`}>
          {help}
        </p>
      ) : null}
    </div>
  );
}

export function Field({
  label,
  name,
  type = "text",
  defaultValue,
  required = true,
  help,
  placeholder,
  accept,
  className,
  inputClassName,
}: {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string;
  required?: boolean;
  help?: string;
  placeholder?: string;
  accept?: string;
  className?: string;
  inputClassName?: string;
}) {
  return (
    <FieldShell className={className} help={help} label={label} name={name} required={required}>
      <input
        accept={accept}
        aria-describedby={help ? `${fieldId(name)}-help` : undefined}
        className={cn(controlStyles, type === "file" && "file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1 file:text-sm file:font-medium file:text-foreground", inputClassName)}
        defaultValue={defaultValue}
        id={fieldId(name)}
        name={name}
        placeholder={placeholder}
        required={required}
        type={type}
      />
    </FieldShell>
  );
}

export function TextArea({
  label,
  name,
  required = false,
  defaultValue,
  help,
  placeholder,
  rows = 3,
  className,
}: {
  label: string;
  name: string;
  required?: boolean;
  defaultValue?: string;
  help?: string;
  placeholder?: string;
  rows?: number;
  className?: string;
}) {
  return (
    <FieldShell className={className} help={help} label={label} name={name} required={required}>
      <textarea
        aria-describedby={help ? `${fieldId(name)}-help` : undefined}
        className={cn(controlStyles, "min-h-20")}
        defaultValue={defaultValue}
        id={fieldId(name)}
        name={name}
        placeholder={placeholder}
        required={required}
        rows={rows}
      />
    </FieldShell>
  );
}

export function SelectField({
  label,
  name,
  children,
  defaultValue,
  required = false,
  help,
  className,
  selectClassName,
}: {
  label: string;
  name: string;
  children: ReactNode;
  defaultValue?: string;
  required?: boolean;
  help?: string;
  className?: string;
  selectClassName?: string;
}) {
  return (
    <FieldShell className={className} help={help} label={label} name={name} required={required}>
      <select
        aria-describedby={help ? `${fieldId(name)}-help` : undefined}
        className={cn(controlStyles, "appearance-none bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2216%22%20height%3D%2216%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%234f617b%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22%2F%3E%3C%2Fsvg%3E')] bg-[length:16px] bg-[position:right_0.75rem_center] bg-no-repeat pr-9", selectClassName)}
        defaultValue={defaultValue}
        id={fieldId(name)}
        name={name}
        required={required}
      >
        {children}
      </select>
    </FieldShell>
  );
}

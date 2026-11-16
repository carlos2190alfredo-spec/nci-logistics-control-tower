import { useId, type ChangeEventHandler, type ReactNode } from "react";
import { FieldInputControl, FieldSelectControl, FieldTextAreaControl, type SelectOption } from "@/components/ui/field-controls";
import { helpIdFor } from "@/components/ui/field-state";
import { cn } from "@/lib/utils";

export type { SelectOption } from "@/components/ui/field-controls";

const controlStyles =
  "min-h-10 w-full rounded-lg border border-border bg-surface px-3 py-2 text-foreground shadow-xs transition-colors duration-150 placeholder:text-faint-foreground hover:border-border-strong focus:border-primary";

/**
 * Campos de formulario del sistema de diseño.
 *
 * `Field`, `TextArea` y `SelectField` son componentes de servidor (usables
 * también desde componentes de cliente): la etiqueta, el contenedor y el texto
 * de ayuda se renderizan sin JavaScript. Solo el control y su mensaje de error
 * son una isla de cliente pequeña (`field-controls.tsx`) porque deben leer los
 * errores por campo que publica `ServerForm`.
 *
 * Errores: se pinta el de la prop `error` o, si no se pasa, el de
 * `fieldErrors[name]` del `ServerForm` que envuelve al campo. Con error el
 * control lleva `aria-invalid="true"`, borde `border-danger` y
 * `aria-describedby` con el id del mensaje (primero) y el de la ayuda. Sin error
 * el HTML es idéntico al de la versión anterior.
 *
 * El id del control usa useId: el mismo campo puede repetirse en varias
 * tarjetas de la misma página (p. ej. formularios por viaje) sin colisiones
 * de id ni asociaciones label→control rotas. Con la prop `id` se fija uno
 * propio (los ids de ayuda y error derivan de él: `<id>-help`, `<id>-error`).
 *
 * Notas de uso:
 * - `required` es `true` por defecto en `Field` (contrato existente); en
 *   `TextArea` y `SelectField` es `false`.
 * - Un control `disabled` no se envía con el formulario.
 * - `value` crea un control controlado: exige `onChange` (solo desde componentes
 *   de cliente) o `readOnly`.
 * - Decimales: `type="number"` usa paso 1 salvo que se indique `step`
 *   (`step="any"` o `step="0.01"`); con `inputMode="decimal"` el móvil muestra
 *   el teclado numérico con coma.
 */
function FieldShell({
  label,
  controlId,
  helpId,
  required,
  help,
  children,
  className,
}: {
  label: string;
  controlId: string;
  helpId: string;
  required?: boolean;
  help?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("grid gap-1.5", className)}>
      <label className="text-sm font-medium text-foreground" htmlFor={controlId}>
        {label}
        {required ? (
          <span aria-hidden className="ml-0.5 text-danger">
            *
          </span>
        ) : null}
      </label>
      {children}
      {help ? (
        <p className="text-xs text-muted-foreground" id={helpId}>
          {help}
        </p>
      ) : null}
    </div>
  );
}

type CommonFieldProps = {
  label: string;
  name: string;
  help?: string;
  className?: string;
  /** Id propio del control (por defecto, generado con useId). */
  id?: string;
  /** Mensaje de error explícito; si no se pasa se lee `fieldErrors[name]` del `ServerForm`. */
  error?: string;
  /** Fuerza `aria-invalid` aunque no haya mensaje (p. ej. validación propia en un componente de cliente). */
  "aria-invalid"?: boolean;
  /** Ids ajenos que se añaden a `aria-describedby` después del error y la ayuda. */
  "aria-describedby"?: string;
  disabled?: boolean;
  readOnly?: boolean;
  defaultValue?: string;
  value?: string;
};

export type FieldProps = CommonFieldProps & {
  type?: string;
  required?: boolean;
  placeholder?: string;
  accept?: string;
  inputClassName?: string;
  autoComplete?: string;
  inputMode?: "none" | "text" | "decimal" | "numeric" | "tel" | "search" | "email" | "url";
  maxLength?: number;
  minLength?: number;
  min?: number | string;
  max?: number | string;
  step?: number | string;
  pattern?: string;
  /** Id de un `<datalist>` con sugerencias. */
  list?: string;
  onChange?: ChangeEventHandler<HTMLInputElement>;
};

export function Field({
  label,
  name,
  type = "text",
  defaultValue,
  value,
  required = true,
  help,
  placeholder,
  accept,
  className,
  inputClassName,
  autoComplete,
  inputMode,
  maxLength,
  minLength,
  min,
  max,
  step,
  pattern,
  list,
  readOnly,
  disabled,
  id,
  error,
  onChange,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedBy,
}: FieldProps) {
  const generatedId = useId();
  const controlId = id ?? generatedId;
  return (
    <FieldShell className={className} controlId={controlId} help={help} helpId={helpIdFor(controlId)} label={label} required={required}>
      <FieldInputControl
        accept={accept}
        autoComplete={autoComplete}
        className={cn(controlStyles, type === "file" && "file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1 file:text-sm file:font-medium file:text-foreground", inputClassName)}
        controlId={controlId}
        defaultValue={defaultValue}
        disabled={disabled}
        error={error}
        extraDescribedBy={ariaDescribedBy}
        hasHelp={Boolean(help)}
        inputMode={inputMode}
        invalid={ariaInvalid}
        list={list}
        max={max}
        maxLength={maxLength}
        min={min}
        minLength={minLength}
        name={name}
        onChange={onChange}
        pattern={pattern}
        placeholder={placeholder}
        readOnly={readOnly}
        required={required}
        step={step}
        type={type}
        value={value}
      />
    </FieldShell>
  );
}

export type TextAreaProps = CommonFieldProps & {
  required?: boolean;
  placeholder?: string;
  rows?: number;
  maxLength?: number;
  minLength?: number;
  onChange?: ChangeEventHandler<HTMLTextAreaElement>;
};

export function TextArea({
  label,
  name,
  required = false,
  defaultValue,
  value,
  help,
  placeholder,
  rows = 3,
  maxLength,
  minLength,
  readOnly,
  disabled,
  id,
  error,
  onChange,
  className,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedBy,
}: TextAreaProps) {
  const generatedId = useId();
  const controlId = id ?? generatedId;
  return (
    <FieldShell className={className} controlId={controlId} help={help} helpId={helpIdFor(controlId)} label={label} required={required}>
      <FieldTextAreaControl
        className={cn(controlStyles, "min-h-20")}
        controlId={controlId}
        defaultValue={defaultValue}
        disabled={disabled}
        error={error}
        extraDescribedBy={ariaDescribedBy}
        hasHelp={Boolean(help)}
        invalid={ariaInvalid}
        maxLength={maxLength}
        minLength={minLength}
        name={name}
        onChange={onChange}
        placeholder={placeholder}
        readOnly={readOnly}
        required={required}
        rows={rows}
        value={value}
      />
    </FieldShell>
  );
}

export type SelectFieldProps = Omit<CommonFieldProps, "readOnly"> & {
  /** Opciones como `<option>` (uso original). */
  children?: ReactNode;
  /** Opciones como datos; admiten `disabled`. Van después de la opción vacía y antes de `children`. */
  options?: ReadonlyArray<SelectOption>;
  /**
   * Texto de la opción vacía (`value=""`), p. ej. "Seleccione un cliente".
   * Un `<select>` con opción vacía deshabilitada no envía el campo: lea
   * `String(formData.get(name) ?? "")`.
   */
  placeholder?: string;
  /**
   * La opción vacía se puede volver a elegir (campo opcional, p. ej. "Sin equipo").
   * Por defecto queda deshabilitada: es solo un marcador.
   */
  allowEmpty?: boolean;
  required?: boolean;
  selectClassName?: string;
  onChange?: ChangeEventHandler<HTMLSelectElement>;
};

export function SelectField({
  label,
  name,
  children,
  options,
  placeholder,
  allowEmpty,
  defaultValue,
  value,
  required = false,
  help,
  disabled,
  id,
  error,
  onChange,
  className,
  selectClassName,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedBy,
}: SelectFieldProps) {
  const generatedId = useId();
  const controlId = id ?? generatedId;
  return (
    <FieldShell className={className} controlId={controlId} help={help} helpId={helpIdFor(controlId)} label={label} required={required}>
      <FieldSelectControl
        allowEmpty={allowEmpty}
        className={cn(controlStyles, "appearance-none bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2216%22%20height%3D%2216%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%234f617b%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22%2F%3E%3C%2Fsvg%3E')] bg-[length:16px] bg-[position:right_0.75rem_center] bg-no-repeat pr-9", selectClassName)}
        controlId={controlId}
        defaultValue={defaultValue}
        disabled={disabled}
        error={error}
        extraDescribedBy={ariaDescribedBy}
        hasHelp={Boolean(help)}
        invalid={ariaInvalid}
        name={name}
        onChange={onChange}
        options={options}
        placeholder={placeholder}
        required={required}
        value={value}
      >
        {children}
      </FieldSelectControl>
    </FieldShell>
  );
}

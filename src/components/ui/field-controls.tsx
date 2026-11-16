"use client";

/**
 * Islas de cliente de `Field`, `TextArea` y `SelectField`.
 *
 * Por qué existen (decisión de ADR-038): `Field` seguía siendo un componente de
 * servidor (sin "use client") y lo usan decenas de páginas del servidor. Un
 * componente de servidor no puede leer el contexto de `ServerForm`, y el
 * atributo `aria-invalid`, el `aria-describedby` encadenado y el borde rojo
 * tienen que vivir EN el control. La salida mínima sin mutar el DOM a mano es
 * que solo el control (input/textarea/select) más su mensaje de error sean de
 * cliente; la etiqueta, el texto de ayuda y el contenedor siguen renderizándose
 * en el servidor. Sin error el HTML es idéntico al de antes (ver
 * `field-markup.test.ts`).
 *
 * Los atributos se escriben uno a uno y en el mismo orden que el código
 * original para que el marcado de los usos existentes no cambie ni en el orden
 * de los atributos.
 */
import type { ChangeEventHandler, ReactNode } from "react";
import { OctagonAlert } from "lucide-react";
import { describeField } from "@/components/ui/field-state";
import { useFormContext } from "@/components/ui/form-context";
import { cn } from "@/lib/utils";

/** Borde de error: sustituye al borde base, al hover y al foco (twMerge resuelve el conflicto). */
const invalidControlStyles = "border-danger hover:border-danger focus:border-danger";

type FieldBinding = {
  /** Atributo `name` del control: clave en `fieldErrors`. */
  name: string;
  controlId: string;
  /** Hay texto de ayuda renderizado con id `${controlId}-help`. */
  hasHelp: boolean;
  /** Error explícito (gana sobre el del contexto; "" = sin error). */
  error?: string;
  /** `aria-invalid` forzado por quien usa el campo. */
  invalid?: boolean;
  /** Ids ajenos que se añaden al final de `aria-describedby`. */
  extraDescribedBy?: string;
};

function useFieldDescription({ name, controlId, hasHelp, error, invalid, extraDescribedBy }: FieldBinding) {
  const { fieldErrors } = useFormContext();
  return describeField({
    name,
    controlId,
    hasHelp,
    explicitError: error,
    forceInvalid: invalid,
    extraDescribedBy,
    fieldErrors,
  });
}

/**
 * Mensaje de error de un campo. Lleva icono además del color (la información
 * no depende solo del color) y `text-danger-strong` para cumplir contraste AA
 * también sobre el fondo de página, no solo sobre tarjetas blancas.
 */
function FieldErrorMessage({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p className="flex items-start gap-1.5 text-xs font-medium text-danger-strong" id={id}>
      <OctagonAlert aria-hidden className="mt-px size-3.5 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

export type FieldInputControlProps = FieldBinding & {
  accept?: string;
  autoComplete?: string;
  className: string;
  defaultValue?: string;
  disabled?: boolean;
  inputMode?: "none" | "text" | "decimal" | "numeric" | "tel" | "search" | "email" | "url";
  list?: string;
  max?: number | string;
  maxLength?: number;
  min?: number | string;
  minLength?: number;
  onChange?: ChangeEventHandler<HTMLInputElement>;
  pattern?: string;
  placeholder?: string;
  readOnly?: boolean;
  required?: boolean;
  step?: number | string;
  type: string;
  value?: string;
};

export function FieldInputControl({
  name,
  controlId,
  hasHelp,
  error,
  invalid,
  extraDescribedBy,
  accept,
  autoComplete,
  className,
  defaultValue,
  disabled,
  inputMode,
  list,
  max,
  maxLength,
  min,
  minLength,
  onChange,
  pattern,
  placeholder,
  readOnly,
  required,
  step,
  type,
  value,
}: FieldInputControlProps) {
  const description = useFieldDescription({ name, controlId, hasHelp, error, invalid, extraDescribedBy });
  return (
    <>
      <input
        accept={accept}
        aria-describedby={description.describedBy}
        aria-invalid={description.invalid ? true : undefined}
        autoComplete={autoComplete}
        className={cn(className, description.invalid && invalidControlStyles)}
        defaultValue={defaultValue}
        disabled={disabled}
        id={controlId}
        inputMode={inputMode}
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
      {description.error ? <FieldErrorMessage id={description.errorId}>{description.error}</FieldErrorMessage> : null}
    </>
  );
}

export type FieldTextAreaControlProps = FieldBinding & {
  className: string;
  defaultValue?: string;
  disabled?: boolean;
  maxLength?: number;
  minLength?: number;
  onChange?: ChangeEventHandler<HTMLTextAreaElement>;
  placeholder?: string;
  readOnly?: boolean;
  required?: boolean;
  rows?: number;
  value?: string;
};

export function FieldTextAreaControl({
  name,
  controlId,
  hasHelp,
  error,
  invalid,
  extraDescribedBy,
  className,
  defaultValue,
  disabled,
  maxLength,
  minLength,
  onChange,
  placeholder,
  readOnly,
  required,
  rows,
  value,
}: FieldTextAreaControlProps) {
  const description = useFieldDescription({ name, controlId, hasHelp, error, invalid, extraDescribedBy });
  return (
    <>
      <textarea
        aria-describedby={description.describedBy}
        aria-invalid={description.invalid ? true : undefined}
        className={cn(className, description.invalid && invalidControlStyles)}
        defaultValue={defaultValue}
        disabled={disabled}
        id={controlId}
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
      {description.error ? <FieldErrorMessage id={description.errorId}>{description.error}</FieldErrorMessage> : null}
    </>
  );
}

export type SelectOption = { value: string; label: string; disabled?: boolean };

export type FieldSelectControlProps = FieldBinding & {
  /** Opciones sueltas con soporte de `disabled` (se pintan después de la opción vacía y antes de `children`). */
  options?: ReadonlyArray<SelectOption>;
  /** Texto de la opción vacía (`value=""`). */
  placeholder?: string;
  /** La opción vacía se puede volver a elegir (campo opcional). Por defecto queda deshabilitada. */
  allowEmpty?: boolean;
  children?: ReactNode;
  className: string;
  defaultValue?: string;
  disabled?: boolean;
  onChange?: ChangeEventHandler<HTMLSelectElement>;
  required?: boolean;
  value?: string;
};

export function FieldSelectControl({
  name,
  controlId,
  hasHelp,
  error,
  invalid,
  extraDescribedBy,
  options,
  placeholder,
  allowEmpty = false,
  children,
  className,
  defaultValue,
  disabled,
  onChange,
  required,
  value,
}: FieldSelectControlProps) {
  const description = useFieldDescription({ name, controlId, hasHelp, error, invalid, extraDescribedBy });
  // Con opción vacía y sin valor inicial, el navegador elegiría la primera opción
  // NO deshabilitada y el marcador nunca se vería: se fuerza `""`.
  const initialValue = defaultValue ?? (value === undefined && placeholder !== undefined ? "" : undefined);
  return (
    <>
      <select
        aria-describedby={description.describedBy}
        aria-invalid={description.invalid ? true : undefined}
        className={cn(className, description.invalid && invalidControlStyles)}
        defaultValue={initialValue}
        disabled={disabled}
        id={controlId}
        name={name}
        onChange={onChange}
        required={required}
        value={value}
      >
        {placeholder !== undefined ? (
          <option disabled={!allowEmpty} value="">
            {placeholder}
          </option>
        ) : null}
        {options?.map((option) => (
          <option disabled={option.disabled} key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
        {children}
      </select>
      {description.error ? <FieldErrorMessage id={description.errorId}>{description.error}</FieldErrorMessage> : null}
    </>
  );
}

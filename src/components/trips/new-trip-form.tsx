"use client";

import { useState } from "react";
import { CheckboxField, Field, FormSection, SelectField, ServerForm, SubmitButton, TextArea } from "@/components/ui";
import type { ActionResult } from "@/lib/server/action-result";

export type NewTripCustomer = { id: string; name: string; contactName: string | null; contactPhone: string | null };
export type NewTripServiceType = { id: string; name: string; requiresEquipment: boolean };

type Props = {
  action: (previous: ActionResult, formData: FormData) => Promise<ActionResult>;
  customers: NewTripCustomer[];
  serviceTypes: NewTripServiceType[];
  places: string[];
  clientRequestKey: string;
  defaultScheduledAt: string;
  minScheduledAt: string;
};

/**
 * Formulario de "Nuevo viaje". Cliente: mantiene lo escrito si el servidor rechaza el envio
 * (`ServerForm` no resetea ante un error) y precarga el contacto del cliente elegido.
 */
export function NewTripForm({ action, customers, serviceTypes, places, clientRequestKey, defaultScheduledAt, minScheduledAt }: Props) {
  const [customerId, setCustomerId] = useState("");
  const [serviceTypeId, setServiceTypeId] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactTouched, setContactTouched] = useState(false);

  const serviceType = serviceTypes.find((item) => item.id === serviceTypeId);
  const serviceHelp = serviceType
    ? serviceType.requiresEquipment
      ? "Este servicio usa chasis o remolque: lo asignará en el siguiente paso."
      : "Este servicio no necesita chasis ni remolque."
    : undefined;

  function chooseCustomer(id: string) {
    setCustomerId(id);
    const customer = customers.find((item) => item.id === id);
    if (customer && !contactTouched) {
      setContactName(customer.contactName ?? "");
      setContactPhone(customer.contactPhone ?? "");
    }
  }

  return (
    <ServerForm action={action} className="grid gap-6" label="Nuevo viaje" resetOnSuccess={false} testId="new-trip-form">
      <input name="clientRequestKey" type="hidden" value={clientRequestKey} />

      <FormSection description="¿Para quién es el viaje y qué servicio necesita?" title="Cliente y servicio">
        <SelectField
          label="Cliente"
          name="customerAccountId"
          onChange={(event) => chooseCustomer(event.target.value)}
          options={customers.map((customer) => ({ value: customer.id, label: customer.name }))}
          placeholder="Seleccione un cliente"
          required
          value={customerId}
        />
        <SelectField
          help={serviceHelp}
          label="Tipo de servicio"
          name="serviceTypeId"
          onChange={(event) => setServiceTypeId(event.target.value)}
          options={serviceTypes.map((item) => ({ value: item.id, label: item.name }))}
          placeholder="Seleccione un servicio"
          required
          value={serviceTypeId}
        />
      </FormSection>

      <FormSection description="Elija uno de sus lugares frecuentes o escriba otra dirección." title="Ruta">
        <Field label="Origen" list="nuevo-viaje-lugares" name="origin" placeholder="Ej.: Patio Colón" />
        <Field label="Destino" list="nuevo-viaje-lugares" name="destination" placeholder="Ej.: Bodega Panamá" />
        <datalist id="nuevo-viaje-lugares">
          {places.map((place) => (
            <option key={place} value={place} />
          ))}
        </datalist>
      </FormSection>

      <FormSection title="Cuándo">
        <Field
          defaultValue={defaultScheduledAt}
          help="Hora de Panamá (UTC−5)."
          label="Fecha y hora de recogida"
          min={minScheduledAt}
          name="scheduledAt"
          type="datetime-local"
        />
        <SelectField
          defaultValue="NORMAL"
          label="Prioridad"
          name="priority"
          options={[
            { value: "NORMAL", label: "Normal" },
            { value: "URGENT", label: "Urgente" },
          ]}
        />
      </FormSection>

      <FormSection description="Quién coordina la recogida en el sitio. Se precarga con el contacto del cliente." title="Contacto en el sitio">
        <Field
          label="Nombre del contacto"
          name="contactName"
          onChange={(event) => {
            setContactTouched(true);
            setContactName(event.target.value);
          }}
          required={false}
          value={contactName}
        />
        <Field
          inputMode="tel"
          label="Teléfono del contacto"
          name="contactPhone"
          onChange={(event) => {
            setContactTouched(true);
            setContactPhone(event.target.value);
          }}
          required={false}
          value={contactPhone}
        />
      </FormSection>

      <details className="rounded-lg border border-border bg-surface p-4">
        <summary className="cursor-pointer text-sm font-semibold text-foreground">Contenedor (opcional)</summary>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field label="Número de contenedor" name="containerNumber" placeholder="Ej.: MSCU1234567" required={false} />
          <Field label="Tamaño del contenedor" name="containerSize" placeholder="Ej.: 40'" required={false} />
          <Field label="Tipo de contenedor" name="containerType" placeholder="Ej.: High cube" required={false} />
          <Field label="Naviera" name="shippingLine" required={false} />
          <Field label="Terminal" name="terminal" placeholder="Ej.: MIT" required={false} />
          <Field label="Número de sello" name="sealNumber" required={false} />
          <SelectField
            allowEmpty
            label="Estado de carga"
            name="loadStatus"
            options={[
              { value: "LOADED", label: "Cargado" },
              { value: "EMPTY", label: "Vacío" },
            ]}
            placeholder="Sin indicar"
          />
          <Field label="Referencia de booking" name="bookingReference" required={false} />
          <CheckboxField label="Hay que devolver el contenedor vacío" name="emptyReturnRequired" />
        </div>
      </details>

      <details className="rounded-lg border border-border bg-surface p-4">
        <summary className="cursor-pointer text-sm font-semibold text-foreground">Más detalles</summary>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <SelectField
            allowEmpty
            help="Nos ayuda a saber cómo llegan sus pedidos."
            label="Canal de la solicitud"
            name="source"
            options={[
              { value: "PHONE", label: "Teléfono" },
              { value: "WHATSAPP", label: "WhatsApp" },
              { value: "EMAIL", label: "Correo" },
              { value: "WALK_IN", label: "Presencial" },
            ]}
            placeholder="Sin indicar"
          />
          <TextArea className="sm:col-span-2" help="Solo las ve su equipo, nunca el cliente." label="Notas internas" name="notes" required={false} rows={3} />
        </div>
      </details>

      <div>
        <SubmitButton>Crear viaje</SubmitButton>
      </div>
    </ServerForm>
  );
}

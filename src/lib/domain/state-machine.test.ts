import { describe, expect, it } from "vitest";
import {
  ASSIGNABLE_TRIP_STATUSES,
  TERMINAL_TRIP_STATUSES,
  canTransition,
  customerNextStep,
  customerVisibleStatus,
  exceptionStatuses,
  nextStatuses,
  transitionRequiresReason,
  tripTransitions,
} from "@/lib/domain/state-machine";
import { DRIVER_ALLOWED_TRANSITIONS } from "@/lib/offline/protocol";

describe("trip state machine", () => {
  it("allows only role-approved transitions", () => {
    expect(canTransition("ASSIGNED", "DRIVER_CONFIRMED", "DRIVER")).toBe(true);
    expect(canTransition("ASSIGNED", "CLOSED", "DRIVER")).toBe(false);
    expect(canTransition("EVIDENCE_SUBMITTED", "EVIDENCE_APPROVED", "DRIVER")).toBe(false);
  });

  it("returns valid next states for a dispatcher", () => {
    expect(nextStatuses("CONFIRMED", "DISPATCHER")).toEqual(["SCHEDULED"]);
  });

  it("maps internal statuses to customer-safe labels", () => {
    expect(customerVisibleStatus.IN_TRANSIT).toBe("En transito");
    expect(customerVisibleStatus.EVIDENCE_APPROVED).toBe("Documentacion disponible");
  });

  it("provides a natural-language next step for every status", () => {
    for (const status of Object.keys(customerVisibleStatus) as (keyof typeof customerVisibleStatus)[]) {
      expect(customerNextStep[status], `next step for ${status}`).toBeTruthy();
    }
    expect(customerNextStep.IN_TRANSIT).toBe("La unidad llegará al destino");
  });

  it("makes CANCELLED reachable from every pre-delivery state, always with a reason", () => {
    const cancellable = tripTransitions.filter((t) => t.to === "CANCELLED");
    expect(cancellable.length).toBeGreaterThanOrEqual(12);
    for (const transition of cancellable) {
      expect(transition.requiresReason, `${transition.from} -> CANCELLED`).toBe(true);
      expect(transition.roles).not.toContain("DRIVER");
    }
    expect(canTransition("CONFIRMED", "CANCELLED", "DISPATCHER")).toBe(true);
    expect(canTransition("IN_TRANSIT", "CANCELLED", "OPERATIONS_MANAGER")).toBe(true);
  });

  it("restricts late cancellation (after loading) to managers", () => {
    expect(canTransition("WAITING_AT_ORIGIN", "CANCELLED", "DISPATCHER")).toBe(true);
    expect(canTransition("LOADING_OR_PICKUP", "CANCELLED", "DISPATCHER")).toBe(false);
    expect(canTransition("LOADING_OR_PICKUP", "CANCELLED", "TENANT_ADMIN")).toBe(true);
  });

  it("never cancels after delivery or from terminal states", () => {
    for (const from of ["DELIVERED", "EVIDENCE_PENDING", "EVIDENCE_SUBMITTED", "EVIDENCE_APPROVED", "CLOSED", "CANCELLED"] as const) {
      expect(canTransition(from, "CANCELLED", "TENANT_OWNER"), from).toBe(false);
    }
  });

  it("terminal states have no outgoing transitions", () => {
    for (const status of TERMINAL_TRIP_STATUSES) {
      expect(tripTransitions.filter((t) => t.from === status)).toEqual([]);
    }
  });

  it("supports failed delivery and a retry/return path", () => {
    expect(canTransition("DELIVERY_IN_PROGRESS", "DELIVERY_FAILED", "DISPATCHER")).toBe(true);
    expect(canTransition("ARRIVED_AT_DESTINATION", "DELIVERY_FAILED", "OPERATIONS_MANAGER")).toBe(true);
    expect(transitionRequiresReason("DELIVERY_IN_PROGRESS", "DELIVERY_FAILED", "DISPATCHER")).toBe(true);
    expect(canTransition("DELIVERY_FAILED", "IN_TRANSIT", "DISPATCHER")).toBe(true);
    expect(canTransition("DELIVERY_FAILED", "CANCELLED", "OPERATIONS_MANAGER")).toBe(true);
    expect(canTransition("DELIVERY_FAILED", "IN_TRANSIT", "DRIVER")).toBe(false);
  });

  it("lets the driver skip the optional wait at origin, keeping wait as the default option", () => {
    expect(nextStatuses("ARRIVED_AT_ORIGIN", "DRIVER")).toEqual(["WAITING_AT_ORIGIN", "LOADING_OR_PICKUP"]);
  });

  it("keeps exception transitions out of the normal advance list and the driver offline queue", () => {
    expect(nextStatuses("IN_TRANSIT", "OPERATIONS_MANAGER")).not.toContain("CANCELLED");
    expect(exceptionStatuses("IN_TRANSIT", "OPERATIONS_MANAGER")).toEqual(["CANCELLED"]);
    expect(exceptionStatuses("DELIVERY_IN_PROGRESS", "DRIVER")).toEqual([]);
    for (const transition of tripTransitions.filter((t) => t.requiresReason)) {
      expect(transition.roles).not.toContain("DRIVER");
    }
    expect(DRIVER_ALLOWED_TRANSITIONS).not.toContain("CANCELLED");
    expect(DRIVER_ALLOWED_TRANSITIONS).not.toContain("DELIVERY_FAILED");
  });

  it("allows reassignment until the driver departs", () => {
    expect(ASSIGNABLE_TRIP_STATUSES).toContain("DRIVER_CONFIRMED");
    expect(ASSIGNABLE_TRIP_STATUSES).not.toContain("EN_ROUTE_TO_ORIGIN");
  });
});

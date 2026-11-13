import { describe, expect, it } from "vitest";
import type { TenantRole, TripStatus } from "@/generated/prisma";
import {
  ASSIGNABLE_TRIP_STATUSES,
  DEDICATED_FLOW_TARGET_STATUSES,
  TERMINAL_TRIP_STATUSES,
  canCloseTrip,
  canTransition,
  customerNextStep,
  customerVisibleStatus,
  exceptionStatuses,
  nextStatuses,
  requiresDedicatedFlow,
  transitionRequiresReason,
  tripTransitions,
} from "@/lib/domain/state-machine";
import { DRIVER_ALLOWED_TRANSITIONS } from "@/lib/offline/protocol";

const ALL_ROLES: TenantRole[] = ["TENANT_OWNER", "TENANT_ADMIN", "OPERATIONS_MANAGER", "DISPATCHER", "SAFETY_MANAGER", "DRIVER"];
const ALL_STATUSES = Object.keys(customerVisibleStatus) as TripStatus[];

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

  describe("evidence pipeline (AT-06)", () => {
    it("never lets a plain status change reach EVIDENCE_SUBMITTED or EVIDENCE_APPROVED", () => {
      expect(DEDICATED_FLOW_TARGET_STATUSES).toEqual(["EVIDENCE_SUBMITTED", "EVIDENCE_APPROVED"]);
      for (const role of ALL_ROLES) {
        expect(canTransition("EVIDENCE_PENDING", "EVIDENCE_SUBMITTED", role), `${role} submit`).toBe(false);
        expect(canTransition("EVIDENCE_SUBMITTED", "EVIDENCE_APPROVED", role), `${role} approve`).toBe(false);
        // Tampoco saltando estados: ningun origen llega a un estado de evidencia por cambio generico.
        for (const from of ALL_STATUSES) {
          expect(canTransition(from, "EVIDENCE_SUBMITTED", role), `${from} -> EVIDENCE_SUBMITTED (${role})`).toBe(false);
          expect(canTransition(from, "EVIDENCE_APPROVED", role), `${from} -> EVIDENCE_APPROVED (${role})`).toBe(false);
        }
      }
    });

    it("keeps the evidence targets out of every advance list (ops Avanzar, driver app, offline hints)", () => {
      for (const role of ALL_ROLES) {
        for (const from of ALL_STATUSES) {
          const next = nextStatuses(from, role);
          expect(next, `${from} (${role})`).not.toContain("EVIDENCE_SUBMITTED");
          expect(next, `${from} (${role})`).not.toContain("EVIDENCE_APPROVED");
          expect(exceptionStatuses(from, role)).not.toContain("EVIDENCE_SUBMITTED");
          expect(exceptionStatuses(from, role)).not.toContain("EVIDENCE_APPROVED");
        }
      }
      expect(nextStatuses("EVIDENCE_PENDING", "DRIVER")).toEqual([]);
      expect(nextStatuses("EVIDENCE_PENDING", "OPERATIONS_MANAGER")).toEqual([]);
      expect(nextStatuses("EVIDENCE_SUBMITTED", "OPERATIONS_MANAGER")).toEqual([]);
      expect(nextStatuses("EVIDENCE_SUBMITTED", "TENANT_OWNER")).toEqual([]);
    });

    it("flags exactly the evidence states as dedicated-flow targets", () => {
      expect(requiresDedicatedFlow("EVIDENCE_SUBMITTED")).toBe(true);
      expect(requiresDedicatedFlow("EVIDENCE_APPROVED")).toBe(true);
      for (const status of ALL_STATUSES.filter((s) => s !== "EVIDENCE_SUBMITTED" && s !== "EVIDENCE_APPROVED")) {
        expect(requiresDedicatedFlow(status), status).toBe(false);
      }
    });

    it("keeps the entry into the evidence phase and the close step as plain transitions", () => {
      expect(canTransition("DELIVERED", "EVIDENCE_PENDING", "DRIVER")).toBe(true);
      expect(canTransition("DELIVERED", "EVIDENCE_PENDING", "OPERATIONS_MANAGER")).toBe(true);
      expect(nextStatuses("EVIDENCE_APPROVED", "OPERATIONS_MANAGER")).toEqual(["CLOSED"]);
      expect(nextStatuses("EVIDENCE_APPROVED", "TENANT_OWNER")).toEqual(["CLOSED"]);
      expect(nextStatuses("EVIDENCE_APPROVED", "DRIVER")).toEqual([]);
    });

    it("only closes from EVIDENCE_APPROVED and never for the driver", () => {
      const closing = tripTransitions.filter((t) => t.to === "CLOSED");
      expect(closing.length).toBeGreaterThan(0);
      for (const transition of closing) {
        expect(transition.from).toBe("EVIDENCE_APPROVED");
        expect(transition.roles).not.toContain("DRIVER");
      }
      for (const from of ALL_STATUSES.filter((s) => s !== "EVIDENCE_APPROVED")) {
        for (const role of ALL_ROLES) expect(canTransition(from, "CLOSED", role), `${from} (${role})`).toBe(false);
      }
    });

    it("requires an approved proof and proofReady to close", () => {
      expect(canCloseTrip({ proofReady: false, proof: null })).toBe(false);
      expect(canCloseTrip({ proofReady: true, proof: null })).toBe(false);
      expect(canCloseTrip({ proofReady: true, proof: { status: "SUBMITTED" } })).toBe(false);
      expect(canCloseTrip({ proofReady: true, proof: { status: "REJECTED" } })).toBe(false);
      expect(canCloseTrip({ proofReady: false, proof: { status: "APPROVED" } })).toBe(false);
      expect(canCloseTrip({ proofReady: true, proof: { status: "APPROVED" } })).toBe(true);
    });
  });

  describe("driver offline whitelist consistency", () => {
    it("never whitelists closing, cancelling or the dedicated evidence states", () => {
      for (const forbidden of ["CLOSED", "CANCELLED", "DELIVERY_FAILED", "EVIDENCE_SUBMITTED", "EVIDENCE_APPROVED"] as const) {
        expect(DRIVER_ALLOWED_TRANSITIONS).not.toContain(forbidden);
      }
    });

    it("every status a DRIVER can reach by a plain transition is in the whitelist", () => {
      const reachable = new Set<TripStatus>();
      for (const from of ALL_STATUSES) {
        for (const to of ALL_STATUSES) if (canTransition(from, to, "DRIVER")) reachable.add(to);
      }
      for (const status of reachable) expect(DRIVER_ALLOWED_TRANSITIONS, status).toContain(status);
    });
  });
});

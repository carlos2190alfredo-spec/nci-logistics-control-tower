import { describe, expect, it } from "vitest";
import { canTransition, customerVisibleStatus, nextStatuses } from "@/lib/domain/state-machine";

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
});

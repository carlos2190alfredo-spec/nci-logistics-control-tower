import { describe, expect, it } from "vitest";
import {
  OPERATIONS_INBOX_REQUEST_STATUSES,
  availableRequestActions,
  canApplyRequestAction,
  requestTransitions,
} from "@/lib/domain/request-state-machine";

describe("service request state machine", () => {
  it("operations can convert, ask for info or reject a new request", () => {
    expect(availableRequestActions("REQUESTED", "OPERATIONS")).toEqual(["convert", "request_info", "reject"]);
  });

  it("a request waiting on the customer cannot be converted until they answer", () => {
    expect(canApplyRequestAction("INFORMATION_REQUIRED", "convert")).toBe(false);
    expect(availableRequestActions("INFORMATION_REQUIRED", "CUSTOMER")).toEqual(["provide_info", "cancel"]);
    expect(requestTransitions.provide_info.to).toBe("UNDER_REVIEW");
    expect(canApplyRequestAction("UNDER_REVIEW", "convert")).toBe(true);
  });

  it("drafts can be submitted or cancelled by the customer, never converted", () => {
    expect(availableRequestActions("DRAFT", "CUSTOMER")).toEqual(["submit_draft", "cancel"]);
    expect(availableRequestActions("DRAFT", "OPERATIONS")).toEqual([]);
  });

  it("terminal request states accept no actions", () => {
    for (const status of ["CONVERTED", "REJECTED", "CANCELLED"] as const) {
      expect(availableRequestActions(status, "OPERATIONS"), status).toEqual([]);
      expect(availableRequestActions(status, "CUSTOMER"), status).toEqual([]);
    }
  });

  it("rejection and info requests carry a reason; customer cancel does not need one", () => {
    expect(requestTransitions.reject.requiresReason).toBe(true);
    expect(requestTransitions.request_info.requiresReason).toBe(true);
    expect(requestTransitions.cancel.requiresReason).toBe(false);
  });

  it("the operations inbox shows requests waiting on the customer but not drafts", () => {
    expect(OPERATIONS_INBOX_REQUEST_STATUSES).toContain("INFORMATION_REQUIRED");
    expect(OPERATIONS_INBOX_REQUEST_STATUSES).not.toContain("DRAFT");
  });
});

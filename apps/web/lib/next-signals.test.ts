import { describe, expect, it } from "vitest";
import { isNextControlFlowSignal } from "./next-signals";

describe("isNextControlFlowSignal", () => {
  it("recognises the errors Next throws to mark a page dynamic, redirect, or 404", () => {
    for (const digest of ["DYNAMIC_SERVER_USAGE", "BAILOUT_TO_CLIENT_SIDE_RENDERING", "NEXT_REDIRECT;replace;/x;307;", "NEXT_NOT_FOUND"]) {
      expect(isNextControlFlowSignal(Object.assign(new Error("x"), { digest })), digest).toBe(true);
    }
  });

  it("does not treat ordinary failures (network, timeout, bad JSON) as signals - those fall back to defaults", () => {
    for (const err of [new Error("fetch failed"), new Error("site content request timed out"), new TypeError("boom"), "string", null, undefined, { digest: 42 }, { digest: "SOMETHING_ELSE" }]) {
      expect(isNextControlFlowSignal(err), String(err)).toBe(false);
    }
  });
});

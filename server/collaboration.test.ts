import { describe, expect, it } from "vitest";
import { canManageProject, decodeLabels, encodeLabels } from "./db";

describe("collaboration permission helpers", () => {
  it("allows owners and admins to manage a project", () => {
    expect(canManageProject("owner")).toBe(true);
    expect(canManageProject("admin")).toBe(true);
    expect(canManageProject("member")).toBe(false);
  });

  it("normalizes labels and ignores malformed persisted values", () => {
    const encoded = encodeLabels([" design ", "design", "", "Research"]);
    expect(decodeLabels(encoded)).toEqual(["design", "Research"]);
    expect(decodeLabels("not-json")).toEqual([]);
    expect(decodeLabels('{"label":"x"}')).toEqual([]);
  });
});

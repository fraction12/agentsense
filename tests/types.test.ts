import { describe, it, expect } from "vitest";
import { VALID_ENTITY_TYPES } from "../extractor.js";
import type { EntityType } from "../types.js";

const ALL_EXPECTED_TYPES: EntityType[] = [
  "person", "project", "decision", "event", "idea", "preference", "place",
  "tool", "organization", "company", "agent", "device", "platform", "skill",
  "concept", "habit", "routine", "subscription", "service", "credential",
  "file", "repository", "website", "contact", "model", "product", "account",
];

describe("Entity Types", () => {
  it("should have exactly 27 valid entity types", () => {
    expect(VALID_ENTITY_TYPES).toHaveLength(27);
  });

  it("should include all expected types", () => {
    for (const type of ALL_EXPECTED_TYPES) {
      expect(VALID_ENTITY_TYPES).toContain(type);
    }
  });

  it("should not have duplicates", () => {
    const unique = new Set(VALID_ENTITY_TYPES);
    expect(unique.size).toBe(VALID_ENTITY_TYPES.length);
  });

  it("should have all types in lowercase", () => {
    for (const type of VALID_ENTITY_TYPES) {
      expect(type).toBe(type.toLowerCase());
    }
  });
});

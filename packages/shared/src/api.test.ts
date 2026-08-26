import { describe, expect, it } from "vitest";
import { buildPaginatedData, paginationQuerySchema } from "./api.js";

describe("paginationQuerySchema", () => {
  it("defaults page to 1 and pageSize to 20 when omitted", () => {
    const result = paginationQuerySchema.parse({});
    expect(result).toEqual({ page: 1, pageSize: 20 });
  });

  it("coerces string query params to numbers", () => {
    const result = paginationQuerySchema.parse({ page: "3", pageSize: "50" });
    expect(result).toEqual({ page: 3, pageSize: 50 });
  });

  it("rejects a pageSize above 100", () => {
    expect(() => paginationQuerySchema.parse({ pageSize: "500" })).toThrow();
  });

  it("rejects page 0 or negative", () => {
    expect(() => paginationQuerySchema.parse({ page: "0" })).toThrow();
    expect(() => paginationQuerySchema.parse({ page: "-1" })).toThrow();
  });
});

describe("buildPaginatedData", () => {
  it("computes totalPages correctly for an even split", () => {
    const result = buildPaginatedData([1, 2, 3], 40, { page: 1, pageSize: 20 });
    expect(result.totalPages).toBe(2);
  });

  it("rounds totalPages up for a remainder", () => {
    const result = buildPaginatedData([1, 2, 3], 41, { page: 1, pageSize: 20 });
    expect(result.totalPages).toBe(3);
  });

  it("returns totalPages of at least 1 even with zero items", () => {
    const result = buildPaginatedData([], 0, { page: 1, pageSize: 20 });
    expect(result.totalPages).toBe(1);
  });

  it("preserves the requested page and pageSize in the response", () => {
    const result = buildPaginatedData(["a"], 100, { page: 4, pageSize: 10 });
    expect(result.page).toBe(4);
    expect(result.pageSize).toBe(10);
  });
});

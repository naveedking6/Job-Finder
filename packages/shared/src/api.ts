import { z } from "zod";

/**
 * Every API response uses one of these two shapes. Keeping this in
 * `shared` (not just defined ad hoc in the API) means the dashboard,
 * once built, can type its API client against the exact same contract
 * instead of guessing the response shape from reading route handlers.
 */

export interface ApiSuccess<T> {
  success: true;
  data: T;
}

export interface ApiError {
  success: false;
  error: {
    message: string;
    code: string;
    details?: unknown;
  };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

export interface PaginatedData<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export function buildPaginatedData<T>(
  items: T[],
  totalItems: number,
  pagination: PaginationQuery,
): PaginatedData<T> {
  return {
    items,
    page: pagination.page,
    pageSize: pagination.pageSize,
    totalItems,
    totalPages: Math.max(1, Math.ceil(totalItems / pagination.pageSize)),
  };
}

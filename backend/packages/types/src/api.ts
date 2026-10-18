/**
 * Transport contracts shared by the API, the web app and the mobile app.
 * Every Operix endpoint answers with one of these envelopes.
 */

export interface ApiMeta {
  requestId: string;
  timestamp: string;
}

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

export interface ApiResponse<T> {
  data: T;
  meta: ApiMeta;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: PaginationMeta;
  meta: ApiMeta;
}

export interface ApiErrorDetail {
  field?: string;
  code: string;
  message: string;
}

export interface ApiErrorBody {
  error: {
    /** Stable machine-readable code, e.g. `CONTRACT_REQUIRED`. */
    code: string;
    message: string;
    statusCode: number;
    details?: ApiErrorDetail[];
    /** Present in non-production environments only. */
    stack?: string;
  };
  meta: ApiMeta;
}

export const SORT_DIRECTION = ['asc', 'desc'] as const;
export type SortDirection = (typeof SORT_DIRECTION)[number];

export interface ListQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  sortBy?: string;
  sortDir?: SortDirection;
  branchId?: string;
  status?: string;
  from?: string;
  to?: string;
}

/** Cursor payload used by the mobile offline sync endpoints. */
export interface SyncCursor {
  since: string;
  entity: string;
  limit: number;
}

export interface SyncResult<T> {
  entity: string;
  changes: T[];
  deletions: string[];
  cursor: string;
  hasMore: boolean;
}

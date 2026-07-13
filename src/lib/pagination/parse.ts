const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

export type PaginationParams = {
  page: number;
  pageSize: number;
  skip: number;
  take: number;
  search: string;
  filters: Record<string, string>;
};

export type PaginatedResult<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
};

export function parsePagination(
  searchParams: Record<string, string | string[] | undefined>,
  opts?: { defaultPageSize?: number; filterKeys?: string[] },
): PaginationParams {
  const raw = typeof searchParams.page === "string" ? parseInt(searchParams.page, 10) : 1;
  const page = Number.isFinite(raw) && raw >= 1 ? raw : 1;

  const rawSize = typeof searchParams.pageSize === "string" ? parseInt(searchParams.pageSize, 10) : (opts?.defaultPageSize ?? DEFAULT_PAGE_SIZE);
  const pageSize = Math.min(Math.max(1, Number.isFinite(rawSize) ? rawSize : DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE);

  const search = typeof searchParams.q === "string" ? searchParams.q.trim().slice(0, 200) : "";

  const filters: Record<string, string> = {};
  for (const key of opts?.filterKeys ?? []) {
    const val = searchParams[key];
    if (typeof val === "string" && val.trim()) {
      filters[key] = val.trim().slice(0, 100);
    }
  }

  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize, search, filters };
}

export function paginatedResult<T>(items: T[], total: number, params: PaginationParams): PaginatedResult<T> {
  const totalPages = Math.max(1, Math.ceil(total / params.pageSize));
  return {
    items,
    total,
    page: params.page,
    pageSize: params.pageSize,
    totalPages,
    hasNext: params.page < totalPages,
    hasPrev: params.page > 1,
  };
}

export function buildPageUrl(basePath: string, params: PaginationParams, page: number): string {
  const sp = new URLSearchParams();
  sp.set("page", String(page));
  if (params.pageSize !== DEFAULT_PAGE_SIZE) sp.set("pageSize", String(params.pageSize));
  if (params.search) sp.set("q", params.search);
  for (const [k, v] of Object.entries(params.filters)) {
    sp.set(k, v);
  }
  const qs = sp.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

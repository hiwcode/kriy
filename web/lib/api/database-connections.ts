import { apiFetch, ApiResponse, ApiPagination } from "./client";
import { toast } from "sonner";

export interface DatabaseConnection {
  id: number;
  name: string;
  connection_url?: string;
  read_only: boolean;
  max_rows: number;
  created_at: string;
  updated_at: string;
}

export interface DatabaseConnectionCreate {
  name: string;
  connection_url: string;
  read_only?: boolean;
  max_rows?: number;
}

export interface DatabaseConnectionFilter {
  filterField: string;
  filterOp:
    | "contains"
    | "equals"
    | "startsWith"
    | "endsWith"
    | "notEquals"
    | "empty"
    | "notEmpty";
  filterValue?: string | number | null;
}

export interface ListDatabaseConnectionsParams {
  limit: number;
  offset: number;
  search?: string;
  filters?: DatabaseConnectionFilter[];
  sortField?: string;
  sortOrder?: "asc" | "desc";
}

export interface ListDatabaseConnectionsResult {
  items: DatabaseConnection[];
  pagination: ApiPagination;
}

export async function listDatabaseConnections(
  params: ListDatabaseConnectionsParams,
  signal?: AbortSignal
): Promise<ListDatabaseConnectionsResult> {
  const searchParams = new URLSearchParams();
  searchParams.set("limit", String(params.limit));
  searchParams.set("offset", String(params.offset));
  if (params.search) {
    searchParams.set("search", params.search);
  }
  if (params.filters && params.filters.length > 0) {
    searchParams.set("filters", JSON.stringify(params.filters));
  }
  if (params.sortField) {
    searchParams.set("sortField", params.sortField);
  }
  if (params.sortOrder) {
    searchParams.set("sortOrder", params.sortOrder);
  }

  const response = await apiFetch<DatabaseConnection[]>(
    `/api/v1/database-connections?${searchParams.toString()}`,
    { method: "GET", signal }
  );

  return {
    items: response.data ?? [],
    pagination: response.pagination ?? {},
  };
}

export async function getDatabaseConnection(
  id: number
): Promise<DatabaseConnection> {
  const response = await apiFetch<DatabaseConnection>(
    `/api/v1/database-connections/${id}`,
    { method: "GET" }
  );
  return response.data!;
}

export async function createDatabaseConnection(
  data: DatabaseConnectionCreate
): Promise<DatabaseConnection> {
  try {
    const response = await apiFetch<DatabaseConnection>(
      "/api/v1/database-connections/",
      {
        method: "POST",
        body: JSON.stringify(data),
      }
    );
    toast.success("Database connection created");
    return response.data!;
  } catch (error) {
    toast.error(error instanceof Error ? error.message : "Failed to create database connection");
    throw error;
  }
}

export async function updateDatabaseConnection(
  id: number,
  data: Partial<DatabaseConnectionCreate>
): Promise<DatabaseConnection> {
  try {
    const response = await apiFetch<DatabaseConnection>(
      `/api/v1/database-connections/${id}`,
      {
        method: "PATCH",
        body: JSON.stringify(data),
      }
    );
    toast.success("Database connection updated");
    return response.data!;
  } catch (error) {
    toast.error(error instanceof Error ? error.message : "Failed to update database connection");
    throw error;
  }
}

export async function deleteDatabaseConnection(id: number): Promise<void> {
  try {
    await apiFetch<null>(`/api/v1/database-connections/${id}`, {
      method: "DELETE",
    });
    toast.success("Database connection deleted");
  } catch (error) {
    toast.error(error instanceof Error ? error.message : "Failed to delete database connection");
    throw error;
  }
}

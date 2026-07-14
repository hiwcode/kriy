"use client";

import * as React from "react";
import {
  ColumnDef,
  ColumnFiltersState,
  SortingState,
  VisibilityState,
  ExpandedState,
  RowSelectionState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  getExpandedRowModel,
  useReactTable,
  FilterFn,
  Row,
} from "@tanstack/react-table";
import {
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  ChevronsLeft,
  ChevronsRight,
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  X,
  Eye,
  Plus,
  Filter,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Filter types
export type FilterType =
  | "contains"
  | "equals"
  | "startsWith"
  | "endsWith"
  | "notEquals"
  | "empty"
  | "notEmpty";

export interface ColumnFilter {
  id: string;
  value: string;
  type: FilterType;
}

// Custom filter function
const customFilterFn: FilterFn<unknown> = (
  row,
  columnId,
  filterValue: ColumnFilter
) => {
  const cellValue = String(row.getValue(columnId) ?? "").toLowerCase();
  const searchValue = filterValue.value.toLowerCase();

  switch (filterValue.type) {
    case "contains":
      return cellValue.includes(searchValue);
    case "equals":
      return cellValue === searchValue;
    case "startsWith":
      return cellValue.startsWith(searchValue);
    case "endsWith":
      return cellValue.endsWith(searchValue);
    case "notEquals":
      return cellValue !== searchValue;
    case "empty":
      return cellValue === "";
    case "notEmpty":
      return cellValue !== "";
    default:
      return cellValue.includes(searchValue);
  }
};

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  searchable?: boolean;
  searchPlaceholder?: string;
  filterable?: boolean;
  sortable?: boolean;
  pagination?: boolean;
  pageSize?: number;
  pageSizeOptions?: number[];
  columnToggle?: boolean;
  expandable?: boolean;
  selectable?: boolean;
  onDeleteSelected?: (rows: TData[]) => void;
  serverSide?: boolean;
  rowCount?: number;
  loading?: boolean;
  onQueryChange?: (query: {
    search: string;
    filters: ColumnFilter[];
    pageIndex: number;
    pageSize: number;
    sorting: SortingState;
  }) => void;
  renderSubComponent?: (props: { row: Row<TData> }) => React.ReactNode;
  onRowClick?: (row: Row<TData>) => void;
  className?: string;
  emptyState?: React.ReactNode;
}

export function DataTable<TData, TValue>({
  columns,
  data,
  searchable = true,
  searchPlaceholder = "Search...",
  filterable = true,
  sortable = true,
  pagination = true,
  pageSize = 10,
  pageSizeOptions = [10, 20, 30, 50, 100],
  columnToggle = true,
  expandable = false,
  selectable = false,
  onDeleteSelected,
  serverSide = false,
  rowCount,
  loading = false,
  onQueryChange,
  renderSubComponent,
  onRowClick,
  className,
  emptyState,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(
    []
  );
  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>({});
  const [globalFilter, setGlobalFilter] = React.useState("");
  const [expanded, setExpanded] = React.useState<ExpandedState>({});
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});
  const [paginationState, setPaginationState] = React.useState({
    pageIndex: 0,
    pageSize,
  });
  const [activeFilters, setActiveFilters] = React.useState<ColumnFilter[]>([]);
  const [showFilterForm, setShowFilterForm] = React.useState(false);

  // Filter bar state
  const [filterColumn, setFilterColumn] = React.useState<string>("");
  const [filterType, setFilterType] = React.useState<FilterType>("contains");
  const [filterValue, setFilterValue] = React.useState("");
  const [debouncedSearch, setDebouncedSearch] = React.useState(globalFilter);
  const computedPageCount = React.useMemo(() => {
    if (!serverSide) return undefined;
    const total = typeof rowCount === "number" ? rowCount : 0;
    return Math.max(1, Math.ceil(total / paginationState.pageSize));
  }, [serverSide, rowCount, paginationState.pageSize]);

  React.useEffect(() => {
    const timeout = setTimeout(() => setDebouncedSearch(globalFilter), 300);
    return () => clearTimeout(timeout);
  }, [globalFilter]);

  React.useEffect(() => {
    setPaginationState((prev) => ({ ...prev, pageIndex: 0 }));
  }, [globalFilter, activeFilters]);

  React.useEffect(() => {
    if (!serverSide || !onQueryChange) return;
    onQueryChange({
      search: debouncedSearch,
      filters: activeFilters,
      pageIndex: paginationState.pageIndex,
      pageSize: paginationState.pageSize,
      sorting,
    });
  }, [
    serverSide,
    onQueryChange,
    debouncedSearch,
    activeFilters,
    paginationState.pageIndex,
    paginationState.pageSize,
    sorting,
  ]);

  // Add selection column if selectable
  const tableColumns = React.useMemo(() => {
    if (!selectable) return columns;

    const selectionColumn: ColumnDef<TData, unknown> = {
      id: "select",
      header: ({ table }) => (
        <Checkbox
          checked={
            table.getIsAllPageRowsSelected() ||
            (table.getIsSomePageRowsSelected() && "indeterminate")
          }
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Select all"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label="Select row"
        />
      ),
      enableSorting: false,
      enableHiding: false,
    };

    return [selectionColumn, ...columns];
  }, [columns, selectable]);

  const table = useReactTable({
    data,
    columns: tableColumns,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      globalFilter,
      expanded,
      rowSelection,
      pagination: paginationState,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onGlobalFilterChange: setGlobalFilter,
    onExpandedChange: setExpanded,
    onRowSelectionChange: setRowSelection,
    onPaginationChange: setPaginationState,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel:
      sortable && !serverSide ? getSortedRowModel() : undefined,
    getFilteredRowModel: serverSide ? undefined : getFilteredRowModel(),
    getPaginationRowModel:
      pagination && !serverSide ? getPaginationRowModel() : undefined,
    getExpandedRowModel: expandable ? getExpandedRowModel() : undefined,
    enableRowSelection: selectable,
    filterFns: {
      custom: customFilterFn,
    },
    globalFilterFn: "includesString",
    manualPagination: serverSide,
    manualFiltering: serverSide,
    manualSorting: serverSide,
    pageCount: serverSide ? computedPageCount : undefined,
  });

  // Get filterable columns (exclude actions and select columns)
  const filterableColumns = table
    .getAllColumns()
    .filter(
      (column) =>
        column.getCanFilter() &&
        column.id !== "actions" &&
        column.id !== "select" &&
        typeof column.columnDef.header === "string"
    );

  // Add filter
  const addFilter = () => {
    if (!filterColumn) return;

    const newFilter: ColumnFilter = {
      id: filterColumn,
      type: filterType,
      value: filterValue,
    };

    const updatedFilters = activeFilters.filter((f) => f.id !== filterColumn);
    updatedFilters.push(newFilter);
    setActiveFilters(updatedFilters);

    table.getColumn(filterColumn)?.setFilterValue(newFilter);

    setFilterColumn("");
    setFilterType("contains");
    setFilterValue("");
  };

  // Remove filter
  const removeFilter = (columnId: string) => {
    setActiveFilters((prev) => prev.filter((f) => f.id !== columnId));
    table.getColumn(columnId)?.setFilterValue(undefined);
  };

  // Clear all filters
  const clearAllFilters = () => {
    setActiveFilters([]);
    setGlobalFilter("");
    table.resetColumnFilters();
  };

  // Handle bulk delete
  const handleBulkDelete = () => {
    if (onDeleteSelected) {
      const selectedRows = (serverSide
        ? table.getSelectedRowModel()
        : table.getFilteredSelectedRowModel()
      ).rows.map((row) => row.original);
      onDeleteSelected(selectedRows);
      setRowSelection({});
    }
  };

  const hasActiveFilters = activeFilters.length > 0 || globalFilter;
  const selectedCount = Object.keys(rowSelection).length;
  const filteredRowModel = serverSide
    ? table.getRowModel()
    : table.getFilteredRowModel();
  const totalRows =
    serverSide && typeof rowCount === "number"
      ? rowCount
      : filteredRowModel.rows.length;
  const visibleRows = serverSide
    ? data.length
    : filteredRowModel.rows.length;
  const startRow =
    totalRows === 0
      ? 0
      : paginationState.pageIndex * paginationState.pageSize + 1;
  const endRow =
    totalRows === 0
      ? 0
      : Math.min(
          paginationState.pageIndex * paginationState.pageSize + visibleRows,
          totalRows
        );
  const pageCount = serverSide
    ? computedPageCount ?? 1
    : table.getPageCount() || 1;

  return (
    <div className={cn("space-y-4", className)}>
      {/* Toolbar */}
      <div className="flex flex-col gap-4">
        {/* Search and Actions Row */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-1 items-center gap-2">
            {/* Global Search */}
            {searchable && (
              <div className="relative max-w-sm flex-1">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder={searchPlaceholder}
                  value={globalFilter}
                  onChange={(e) => setGlobalFilter(e.target.value)}
                  className="pl-9"
                />
              </div>
            )}

            {/* Filter Toggle Button */}
            {filterable && (
              <Button
                variant={showFilterForm || activeFilters.length > 0 ? "secondary" : "outline"}
                size="sm"
                onClick={() => setShowFilterForm(!showFilterForm)}
                className="h-9"
              >
                <Filter className="mr-2 size-4" />
                Filter
                {activeFilters.length > 0 && (
                  <span className="ml-2 flex size-5 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground">
                    {activeFilters.length}
                  </span>
                )}
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Bulk Delete */}
            {selectable && selectedCount > 0 && (
              <Button
                variant="destructive"
                size="sm"
                onClick={handleBulkDelete}
                className="h-9"
              >
                <Trash2 className="mr-2 size-4" />
                Delete ({selectedCount})
              </Button>
            )}

            {/* Clear Filters */}
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearAllFilters}
                className="h-9"
              >
                Clear all
                <X className="ml-2 size-4" />
              </Button>
            )}

            {/* Column Visibility Toggle */}
            {columnToggle && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-9">
                    <Eye className="mr-2 size-4" />
                    Columns
                    <ChevronDown className="ml-2 size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {table
                    .getAllColumns()
                    .filter((column) => column.getCanHide())
                    .map((column) => (
                      <DropdownMenuCheckboxItem
                        key={column.id}
                        checked={column.getIsVisible()}
                        onCheckedChange={(value) =>
                          column.toggleVisibility(!!value)
                        }
                      >
                        {column.id}
                      </DropdownMenuCheckboxItem>
                    ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>

        {/* Filter Form (Collapsible) */}
        {filterable && showFilterForm && (
          <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/30 p-3 sm:flex-row sm:items-center">
            <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
              {/* Column Select */}
              <Select value={filterColumn} onValueChange={setFilterColumn}>
                <SelectTrigger className="h-9 w-full sm:w-[180px]">
                  <SelectValue placeholder="Select column" />
                </SelectTrigger>
                <SelectContent>
                  {filterableColumns.map((column) => (
                    <SelectItem key={column.id} value={column.id}>
                      {String(column.columnDef.header)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Condition Select */}
              <Select
                value={filterType}
                onValueChange={(value) => setFilterType(value as FilterType)}
              >
                <SelectTrigger className="h-9 w-full sm:w-[150px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="contains">Contains</SelectItem>
                  <SelectItem value="equals">Equals</SelectItem>
                  <SelectItem value="startsWith">Starts with</SelectItem>
                  <SelectItem value="endsWith">Ends with</SelectItem>
                  <SelectItem value="notEquals">Not equals</SelectItem>
                  <SelectItem value="empty">Is empty</SelectItem>
                  <SelectItem value="notEmpty">Is not empty</SelectItem>
                </SelectContent>
              </Select>

              {/* Value Input */}
              {filterType !== "empty" && filterType !== "notEmpty" && (
                <Input
                  placeholder="Enter value..."
                  value={filterValue}
                  onChange={(e) => setFilterValue(e.target.value)}
                  className="h-9 w-full sm:flex-1"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      addFilter();
                    }
                  }}
                />
              )}

              {/* Add Filter Button */}
              <Button
                size="sm"
                onClick={addFilter}
                disabled={!filterColumn}
                className="h-9"
              >
                <Plus className="mr-2 size-4" />
                Add
              </Button>
            </div>
          </div>
        )}

        {/* Active Filters Tags */}
        {activeFilters.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">Active:</span>
            {activeFilters.map((filter) => (
              <div
                key={filter.id}
                className="flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-sm"
              >
                <span className="font-medium text-primary">{filter.id}</span>
                <span className="text-muted-foreground">{filter.type}</span>
                {filter.value && (
                  <span className="text-foreground">&quot;{filter.value}&quot;</span>
                )}
                <button
                  onClick={() => removeFilter(filter.id)}
                  className="ml-1 rounded-full p-0.5 hover:bg-primary/20"
                >
                  <X className="size-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Selected Count Info */}
      {selectable && selectedCount > 0 && (
        <div className="text-sm text-muted-foreground">
          {selectedCount} of {visibleRows} row(s) selected
        </div>
      )}

      {/* Table */}
      <div className="rounded-lg border border-border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {expandable && <TableHead className="w-10" />}
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id} className={header.id === "select" ? "w-10" : ""}>
                    {header.isPlaceholder ? null : (
                      <div className="flex items-center gap-2">
                        {sortable &&
                        header.column.getCanSort() &&
                        header.id !== "select" ? (
                          <button
                            className="flex items-center gap-1 hover:text-foreground"
                            onClick={() => header.column.toggleSorting()}
                          >
                            {flexRender(
                              header.column.columnDef.header,
                              header.getContext()
                            )}
                            {header.column.getIsSorted() === "asc" ? (
                              <ArrowUp className="size-4" />
                            ) : header.column.getIsSorted() === "desc" ? (
                              <ArrowDown className="size-4" />
                            ) : (
                              <ArrowUpDown className="size-4 text-muted-foreground" />
                            )}
                          </button>
                        ) : (
                          flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )
                        )}
                      </div>
                    )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <React.Fragment key={row.id}>
                  <TableRow
                    data-state={row.getIsSelected() && "selected"}
                    className={cn(
                      row.getIsSelected() && "bg-muted/50",
                      onRowClick && "cursor-pointer hover:bg-muted/50"
                    )}
                    onClick={
                      onRowClick
                        ? (e) => {
                            if (
                              (e.target as HTMLElement).closest("button") ||
                              (e.target as HTMLElement).closest("[role='menuitem']") ||
                              (e.target as HTMLElement).closest("input[type='checkbox']")
                            )
                              return;
                            onRowClick(row);
                          }
                        : undefined
                    }
                  >
                    {expandable && (
                      <TableCell>
                        {row.getCanExpand() && (
                          <button
                            onClick={() => row.toggleExpanded()}
                            className="rounded p-1 hover:bg-muted"
                          >
                            {row.getIsExpanded() ? (
                              <ChevronDown className="size-4" />
                            ) : (
                              <ChevronRight className="size-4" />
                            )}
                          </button>
                        )}
                      </TableCell>
                    )}
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext()
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                  {expandable && row.getIsExpanded() && renderSubComponent && (
                    <TableRow>
                      <TableCell
                        colSpan={row.getVisibleCells().length + 1}
                        className="bg-muted/30 p-4"
                      >
                        {renderSubComponent({ row })}
                      </TableCell>
                    </TableRow>
                  )}
                </React.Fragment>
              ))
            ) : loading ? (
              Array.from({ length: paginationState.pageSize }).map((_, i) => (
                <TableRow key={`skeleton-${i}`}>
                  {expandable && (
                    <TableCell>
                      <Skeleton className="h-4 w-4" />
                    </TableCell>
                  )}
                  {tableColumns.map((col, j) => (
                    <TableCell key={`skeleton-${i}-${j}`}>
                      <Skeleton
                        className={cn(
                          "h-4 rounded",
                          j === 0 ? "w-[60%]" : j === tableColumns.length - 1 ? "w-8 ml-auto" : "w-[80%]"
                        )}
                      />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={tableColumns.length + (expandable ? 1 : 0)}
                  className="h-24 text-center"
                >
                  {emptyState || "No results."}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {pagination && (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-muted-foreground">
            Showing{" "}
            {startRow}{" "}
            to{" "}
            {endRow} of {totalRows} results
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">
                Rows per page
              </span>
              <Select
                value={String(paginationState.pageSize)}
                onValueChange={(value) => table.setPageSize(Number(value))}
              >
                <SelectTrigger className="h-8 w-[70px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {pageSizeOptions.map((size) => (
                    <SelectItem key={size} value={String(size)}>
                      {size}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                className="size-8"
                onClick={() => table.setPageIndex(0)}
                disabled={!table.getCanPreviousPage()}
              >
                <ChevronsLeft className="size-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="size-8"
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
              >
                <ChevronLeft className="size-4" />
              </Button>
              <span className="flex items-center gap-1 px-2 text-sm">
                <span className="text-muted-foreground">Page</span>
                <strong>
                  {paginationState.pageIndex + 1} of {pageCount}
                </strong>
              </span>
              <Button
                variant="outline"
                size="icon"
                className="size-8"
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
              >
                <ChevronRight className="size-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="size-8"
                onClick={() => table.setPageIndex(table.getPageCount() - 1)}
                disabled={!table.getCanNextPage()}
              >
                <ChevronsRight className="size-4" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

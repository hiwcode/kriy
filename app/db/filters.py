from __future__ import annotations

from typing import Any, Iterable

DEFAULT_FILTER_OPS = {
    "contains",
    "equals",
    "startsWith",
    "endsWith",
    "notEquals",
    "empty",
    "notEmpty",
}

DEFAULT_SORT_ORDERS = {"asc", "desc"}


def build_where(
    *,
    search: str | None,
    search_fields: Iterable[str] | None,
    filters: list[dict[str, Any]] | None = None,
    allowed_fields: dict[str, str],
    allowed_ops: set[str] | None = None,
) -> tuple[str, list[Any]]:
    clauses: list[str] = []
    params: list[Any] = []

    def _add_param(value: Any) -> str:
        params.append(value)
        return f"${len(params)}"

    ops = allowed_ops or DEFAULT_FILTER_OPS

    if search and search_fields:
        placeholder = _add_param(f"%{search}%")
        search_clauses = []
        for field in search_fields:
            if field not in allowed_fields:
                raise ValueError("Invalid search field")
            column = allowed_fields[field]
            search_clauses.append(f"{column}::text ILIKE {placeholder}")
        clauses.append("(" + " OR ".join(search_clauses) + ")")

    def _apply_filter(field: str, op: str, value: str | None) -> None:
        if field not in allowed_fields:
            raise ValueError("Invalid filter_field")
        if op not in ops:
            raise ValueError("Invalid filter_op")

        column = allowed_fields[field]
        use_like = op in {"contains", "startsWith", "endsWith"}
        column_expr = f"{column}::text" if use_like else column

        if op in {"contains", "startsWith", "endsWith", "equals", "notEquals"}:
            if value is None:
                raise ValueError("filter_value is required for this filter_op")

        if op == "equals":
            placeholder = _add_param(value)
            clauses.append(f"{column} = {placeholder}")
        elif op == "notEquals":
            placeholder = _add_param(value)
            clauses.append(f"{column} <> {placeholder}")
        elif op == "contains":
            placeholder = _add_param(f"%{value}%")
            clauses.append(f"{column_expr} ILIKE {placeholder}")
        elif op == "startsWith":
            placeholder = _add_param(f"{value}%")
            clauses.append(f"{column_expr} ILIKE {placeholder}")
        elif op == "endsWith":
            placeholder = _add_param(f"%{value}")
            clauses.append(f"{column_expr} ILIKE {placeholder}")
        elif op == "empty":
            clauses.append(f"{column} IS NULL OR {column}::text = ''")
        elif op == "notEmpty":
            clauses.append(f"{column} IS NOT NULL AND {column}::text <> ''")

    if filters:
        for item in filters:
            field = item.get("filter_field")
            op = item.get("filter_op")
            value = item.get("filter_value")
            if not field or not op:
                raise ValueError("Each filter requires filter_field and filter_op")
            _apply_filter(field, op, value)

    where_sql = ""
    if clauses:
        where_sql = "WHERE " + " AND ".join(clauses)
    return where_sql, params


def build_order_by(
    *,
    sort_field: str | None,
    sort_order: str | None,
    allowed_fields: dict[str, str],
    default: str = "id",
) -> str:
    if not sort_field:
        column = allowed_fields.get(default, default)
        return f"ORDER BY {column}"

    if sort_field not in allowed_fields:
        raise ValueError("Invalid sort_field")

    order = (sort_order or "asc").lower()
    if order not in DEFAULT_SORT_ORDERS:
        raise ValueError("Invalid sort_order")

    column = allowed_fields[sort_field]
    return f"ORDER BY {column} {order.upper()}"

"""Database query tool for agents - executes SQL (read-only by default) against user-configured DB."""

from __future__ import annotations

import json
import logging
import re
from typing import Any

import asyncpg
from google.adk.tools import FunctionTool

logger = logging.getLogger(__name__)

# For SELECT only when read_only
_SELECT_PATTERN = re.compile(r"^\s*SELECT\s+", re.IGNORECASE | re.DOTALL)

_SCHEMA_QUERY = """
SELECT
    t.table_name,
    c.column_name,
    c.data_type,
    c.is_nullable
FROM information_schema.tables t
JOIN information_schema.columns c
    ON t.table_schema = c.table_schema AND t.table_name = c.table_name
WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE'
ORDER BY t.table_name, c.ordinal_position;
"""


def _is_read_only_query(query: str) -> bool:
    """Check if query is SELECT-only (no mutations)."""
    stripped = query.strip()
    if not stripped.strip():
        return False
    return bool(_SELECT_PATTERN.match(stripped))


def make_database_tool(
    connection_url: str,
    read_only: bool = True,
    max_rows: int = 100,
) -> FunctionTool:
    """
    Create a database query tool.

    Args:
        connection_url: PostgreSQL connection URL (postgresql://user:pass@host:port/db)
        read_only: If True, only allow SELECT queries
        max_rows: Maximum rows to return
        name: Tool name for the agent
    """

    async def execute_query(query: str) -> str:
        """Execute a SQL query against the configured database. Returns results as JSON.

        Args:
            query: The SQL query to execute. Supports SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, DROP unless the connection is read-only (SELECT only).

        Returns:
            JSON with columns, rows, and row_count for SELECT queries,
            or a status message with affected row count for write queries.
        """
        if not query or not query.strip():
            return json.dumps({"error": "Empty query"})

        # Reject multiple statements
        stmts = [s.strip() for s in query.split(";") if s.strip()]
        if len(stmts) > 1:
            return json.dumps({"error": "Only a single SQL statement is allowed."})

        if read_only and not _is_read_only_query(query):
            return json.dumps({
                "error": "Only SELECT queries are allowed. This connection is read-only.",
            })

        try:
            conn = await asyncpg.connect(connection_url)
        except Exception as e:
            logger.warning("Database connection failed: %s", e)
            return json.dumps({"error": f"Connection failed: {str(e)}"})

        try:
            is_select = _is_read_only_query(query)

            if is_select:
                rows = await conn.fetch(query)
                if len(rows) > max_rows:
                    rows = rows[:max_rows]
                columns = list(rows[0].keys()) if rows else []
                await conn.close()

                # Convert rows to list of dicts
                result = []
                for row in rows:
                    rec: dict[str, Any] = {}
                    for k, v in row.items():
                        if hasattr(v, "isoformat"):
                            rec[k] = v.isoformat()
                        elif isinstance(v, (bytes, bytearray)):
                            rec[k] = v.decode("utf-8", errors="replace")
                        else:
                            rec[k] = v
                    result.append(rec)

                return json.dumps({"columns": columns, "rows": result, "row_count": len(result)})
            else:
                # Write query (INSERT, UPDATE, DELETE, CREATE, ALTER, DROP, etc.)
                status = await conn.execute(query)
                await conn.close()
                # status is like "INSERT 0 1", "UPDATE 3", "DELETE 2", "CREATE TABLE", etc.
                return json.dumps({"status": status, "message": f"Query executed successfully: {status}"})
        except Exception as e:
            await conn.close()
            logger.warning("Query execution failed: %s", e)
            return json.dumps({"error": f"Query failed: {str(e)}"})

    async def get_schema() -> str:
        """Get the database schema: list of tables and their columns with data types.
        Call this first to understand the database structure before writing queries.
        Returns JSON with tables, each containing table_name and columns (name, type, nullable).
        """
        try:
            conn = await asyncpg.connect(connection_url)
        except Exception as e:
            logger.warning("Database connection failed: %s", e)
            return json.dumps({"error": f"Connection failed: {str(e)}"})

        try:
            rows = await conn.fetch(_SCHEMA_QUERY)
            await conn.close()
        except Exception as e:
            await conn.close()
            logger.warning("Schema fetch failed: %s", e)
            return json.dumps({"error": f"Schema fetch failed: {str(e)}"})

        tables: dict[str, list[dict[str, Any]]] = {}
        for row in rows:
            table_name = row["table_name"]
            if table_name not in tables:
                tables[table_name] = []
            tables[table_name].append({
                "name": row["column_name"],
                "type": row["data_type"],
                "nullable": row["is_nullable"] == "YES",
            })

        schema = [
            {"table": name, "columns": cols}
            for name, cols in sorted(tables.items())
        ]
        return json.dumps({"tables": schema})

    return [
        FunctionTool(func=get_schema),
        FunctionTool(func=execute_query),
    ]

"""Database base module placeholder (no ORM)."""
import asyncio
import asyncpg
import os
import threading
from typing import Any, AsyncGenerator, Optional, Literal
from contextlib import asynccontextmanager
from pathlib import Path
import logging

from app.core.config import settings

# Set up logger
logger = logging.getLogger(__name__)


class DatabaseConnectionManager:
    """
    A thread-safe singleton class to manage PostgreSQL connection pools.
    Implements proper connection pooling, health checks, and error handling.
    """
    _instance: Optional['DatabaseConnectionManager'] = None
    _write_pool: Optional[asyncpg.Pool] = None
    _read_pool: Optional[asyncpg.Pool] = None
    _lock = threading.Lock()
    _initialized = False

    def __new__(cls):
        if not cls._instance:
            with cls._lock:
                # Double-checked locking pattern
                if not cls._instance:
                    cls._instance = super(DatabaseConnectionManager, cls).__new__(cls)
        return cls._instance

    async def initialize(self):
        """
        Initialize PostgreSQL connection pools during application startup.
        Creates separate pools for read and write operations.
        
        Raises:
            ConnectionError: If unable to establish PostgreSQL connection
        """
        if self._initialized:
            return

        try:
            database_url = settings.DATABASE_URL
            
            # Validate database configuration
            if not database_url:
                raise ValueError("Database URL is not configured")

            # Configure write pool with cloud-optimized settings
            # Reduced pool sizes to prevent "too many connections" on managed databases
            min_pool_size = int(os.getenv('DB_POOL_MIN_SIZE', '1'))
            max_pool_size = int(os.getenv('DB_POOL_MAX_SIZE', '2'))
            
            logger.info(f"Creating connection pool: min={min_pool_size}, max={max_pool_size}")
            
            self._write_pool = await asyncpg.create_pool(
                database_url,
                min_size=min_pool_size,
                max_size=max_pool_size,
                max_inactive_connection_lifetime=300.0,  # 5 minutes
                timeout=30.0,  # 30 seconds connection timeout
                command_timeout=60.0,  # 60 seconds command timeout
            )

            # For now, use the same pool for reads (can be configured for read replicas later)
            self._read_pool = self._write_pool

            # Verify connections are successful
            if not await self._check_pool_health("write"):
                raise ConnectionError("Failed initial write pool health check")
            
            self._initialized = True
            logger.info("PostgreSQL connection pools established successfully")

        except Exception as e:
            logger.error(f"Failed to establish PostgreSQL connection: {str(e)}")
            await self._cleanup_pools()
            raise ConnectionError(f"PostgreSQL connection failed: {str(e)}")

    async def get_pool(self, pool_type: Literal["read", "write"] = "write") -> asyncpg.Pool:
        """
        Returns a PostgreSQL connection pool based on the operation type.
        
        Args:
            pool_type: Type of pool to return ("read" or "write")
        
        Returns:
            asyncpg.Pool: Connection pool instance
            
        Raises:
            ConnectionError: If pool is not initialized
        """
        if not self._initialized:
            raise ConnectionError("Database pools not initialized. Call initialize() first.")
        
        pool = self._write_pool if pool_type == "write" else self._read_pool
        if pool is None:
            raise ConnectionError(f"PostgreSQL {pool_type} pool not available.")
        
        return pool

    async def _check_pool_health(self, pool_type: Literal["read", "write"] = "write") -> bool:
        """
        Check pool health by executing a simple query.
        
        Args:
            pool_type: Type of pool to check ("read" or "write")
        
        Returns:
            bool: True if pool is healthy, False otherwise
        """
        try:
            pool = self._write_pool if pool_type == "write" else self._read_pool
            if pool is None:
                return False
                
            async with pool.acquire() as conn:
                await conn.fetchval('SELECT 1')
            return True
        except Exception as e:
            logger.error(f"{pool_type.capitalize()} pool health check failed: {str(e)}")
            return False

    async def get_pool_stats(self, pool_type: Literal["read", "write"] = "write") -> Optional[dict]:
        """
        Get connection pool statistics.
        
        Args:
            pool_type: Type of pool to get stats for ("read" or "write")
        
        Returns:
            dict: Pool statistics or None if pool not available
        """
        try:
            pool = self._write_pool if pool_type == "write" else self._read_pool
            if pool is None:
                return None

            total_size = pool.get_size()
            idle_size = pool.get_idle_size()
            active_size = total_size - idle_size
                
            return {
                "total_size": total_size,
                "idle_size": idle_size,
                "active_size": active_size,
                "pool_type": pool_type
            }
        except Exception as e:
            logger.error(f"Error getting {pool_type} pool stats: {str(e)}")
            return None

    async def _cleanup_pools(self):
        """Internal method to cleanup connection pools"""
        for pool_name, pool in [("write", self._write_pool), ("read", self._read_pool)]:
            if pool is not None and pool != self._write_pool:  # Avoid closing twice if same pool
                try:
                    await pool.close()
                    logger.info(f"PostgreSQL {pool_name} pool closed")
                except Exception as e:
                    logger.error(f"Error closing PostgreSQL {pool_name} pool: {str(e)}")
        
        if self._write_pool is not None:
            try:
                await self._write_pool.close()
                logger.info("PostgreSQL write pool closed")
            except Exception as e:
                logger.error(f"Error closing PostgreSQL write pool: {str(e)}")
        
        self._write_pool = None
        self._read_pool = None
        self._initialized = False

    async def close(self):
        """Closes PostgreSQL connection pools and cleans up resources"""
        await self._cleanup_pools()


# Global instance
_db_manager = DatabaseConnectionManager()


async def init_db_pool() -> None:
    """Initialize the database connection pools"""
    await _db_manager.initialize()


async def close_db_pool() -> None:
    """Close the database connection pools"""
    await _db_manager.close()


async def migration_runner(
    pool: asyncpg.Pool, migrations_dir: str | None = None
) -> list[str]:
    """
    Run SQL migrations from the migrations directory, tracking applied files.
    """
    migrations_path = (
        Path(migrations_dir)
        if migrations_dir
        else Path(__file__).resolve().parent / "migrations"
    )
    if not migrations_path.exists():
        logger.warning("Migrations directory does not exist: %s", migrations_path)
        return []

    sql_files = sorted(migrations_path.glob("*.sql"))
    if not sql_files:
        return []

    applied: set[str] = set()
    async with pool.acquire() as conn:
        await conn.execute(
            """
            CREATE TABLE IF NOT EXISTS schema_migrations (
                filename TEXT PRIMARY KEY,
                applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            """
        )
        rows = await conn.fetch("SELECT filename FROM schema_migrations;")
        applied = {row["filename"] for row in rows}

        applied_files: list[str] = []
        for file_path in sql_files:
            if file_path.name in applied:
                continue
            sql = file_path.read_text(encoding="utf-8").strip()
            if not sql:
                continue
            async with conn.transaction():
                await conn.execute(sql)
                await conn.execute(
                    "INSERT INTO schema_migrations (filename) VALUES ($1);",
                    file_path.name,
                )
            applied_files.append(file_path.name)

    return applied_files


async def init_db(app: Any | None = None) -> asyncpg.Pool:
    """
    Initialize DB pools, run migrations, and attach the pool to the app.
    """
    await init_db_pool()
    pool = await _db_manager.get_pool("write")
    await migration_runner(pool)
    if app is not None:
        app.state.db_pool = pool
    return pool


async def close_db(app: Any | None = None) -> None:
    """
    Close DB pools and detach from the app.
    """
    if app is not None and hasattr(app.state, "db_pool"):
        app.state.db_pool = None
    await close_db_pool()


async def acquire_connection_with_retry(
    pool: asyncpg.Pool, 
    max_retries: int = 3, 
    base_delay: float = 1.0
) -> asyncpg.Connection:
    """
    Acquire a connection with exponential backoff retry logic.
    
    Args:
        pool: The connection pool
        max_retries: Maximum number of retry attempts
        base_delay: Base delay between retries (will be multiplied exponentially)
        
    Returns:
        Connection from the pool
        
    Raises:
        Exception: If connection cannot be acquired after all retries
    """
    for attempt in range(max_retries):
        try:
            return await pool.acquire()
        except Exception as e:
            if attempt == max_retries - 1:
                logger.error(f"Failed to acquire connection after {max_retries} attempts: {str(e)}")
                raise
            
            delay = base_delay * (2 ** attempt)  # Exponential backoff
            logger.warning(f"Failed to acquire connection (attempt {attempt + 1}/{max_retries}): {str(e)}. Retrying in {delay}s")
            await asyncio.sleep(delay)


async def get_db() -> AsyncGenerator[asyncpg.Connection, None]:
    """
    Dependency for getting a database connection with proper error handling.
    """
    pool = await _db_manager.get_pool("write")
    
    # Log pool stats periodically (you can remove this in production)
    stats = await _db_manager.get_pool_stats("write")
    if stats:
        logger.debug(f"DB Pool Stats - Total: {stats['total_size']}, Active: {stats['active_size']}, Idle: {stats['idle_size']}")
    
    conn = None
    try:
        conn = await acquire_connection_with_retry(pool)
        yield conn
    except Exception as e:
        logger.error(f"Database connection error: {str(e)}")
        raise
    finally:
        if conn:
            try:
                await pool.release(conn)
            except Exception as e:
                logger.error(f"Error releasing connection: {str(e)}")


@asynccontextmanager
async def get_db_connection(pool_type: Literal["read", "write"] = "write"):
    """
    Context manager for database connections with automatic cleanup.
    
    Args:
        pool_type: Type of pool to use ("read" or "write")
    """
    pool = await _db_manager.get_pool(pool_type)
    conn = None
    try:
        conn = await acquire_connection_with_retry(pool)
        yield conn
    finally:
        if conn:
            try:
                await pool.release(conn)
            except Exception as e:
                logger.error(f"Error releasing {pool_type} connection: {str(e)}")


async def get_db_manager() -> DatabaseConnectionManager:
    """Get the database connection manager instance"""
    return _db_manager 

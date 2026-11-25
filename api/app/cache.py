"""A tiny cache interface with two backends: Redis, or this process's memory.

With REDIS_URL set, every API instance shares one cache and one rate-limit count. Without it
(local development, tests) an in-memory dict stands in, so nothing extra has to be running.
"""

import threading
import time
from functools import lru_cache
from typing import Protocol

import redis

from app.config import get_settings


class Cache(Protocol):
    def get(self, key: str) -> str | None: ...
    def set(self, key: str, value: str, ttl_seconds: int) -> None: ...
    def delete(self, *keys: str) -> None: ...
    def incr(self, key: str, ttl_seconds: int) -> int:
        """Adds 1 and returns the new count. The ttl starts when the key is first created."""
        ...

    def decr(self, key: str) -> None: ...
    def ttl(self, key: str) -> int: ...
    def ping(self) -> bool: ...


class MemoryCache:
    def __init__(self) -> None:
        self._data: dict[str, tuple[str, float]] = {}
        self._lock = threading.Lock()

    def _live(self, key: str, now: float) -> tuple[str, float] | None:
        item = self._data.get(key)
        if item and item[1] <= now:
            del self._data[key]
            return None
        return item

    def get(self, key: str) -> str | None:
        with self._lock:
            item = self._live(key, time.monotonic())
            return item[0] if item else None

    def set(self, key: str, value: str, ttl_seconds: int) -> None:
        with self._lock:
            self._data[key] = (value, time.monotonic() + ttl_seconds)

    def delete(self, *keys: str) -> None:
        with self._lock:
            for key in keys:
                self._data.pop(key, None)

    def incr(self, key: str, ttl_seconds: int) -> int:
        with self._lock:
            now = time.monotonic()
            item = self._live(key, now)
            count = int(item[0]) + 1 if item else 1
            expires = item[1] if item else now + ttl_seconds
            self._data[key] = (str(count), expires)
            return count

    def decr(self, key: str) -> None:
        with self._lock:
            item = self._live(key, time.monotonic())
            if item:
                self._data[key] = (str(max(0, int(item[0]) - 1)), item[1])

    def ttl(self, key: str) -> int:
        with self._lock:
            item = self._live(key, time.monotonic())
            return max(0, int(item[1] - time.monotonic())) if item else 0

    def ping(self) -> bool:
        return True

    def clear(self) -> None:
        with self._lock:
            self._data.clear()


class RedisCache:
    def __init__(self, url: str) -> None:
        self._r = redis.Redis.from_url(url, decode_responses=True, socket_timeout=2)

    def get(self, key: str) -> str | None:
        return self._r.get(key)  # type: ignore[return-value]

    def set(self, key: str, value: str, ttl_seconds: int) -> None:
        self._r.set(key, value, ex=ttl_seconds)

    def delete(self, *keys: str) -> None:
        if keys:
            self._r.delete(*keys)

    def incr(self, key: str, ttl_seconds: int) -> int:
        # INCR and EXPIRE NX in one round trip; NX keeps the window fixed from the first hit.
        pipe = self._r.pipeline()
        pipe.incr(key)
        pipe.expire(key, ttl_seconds, nx=True)
        count, _ = pipe.execute()
        return int(count)

    def decr(self, key: str) -> None:
        self._r.decr(key)

    def ttl(self, key: str) -> int:
        return max(0, int(self._r.ttl(key)))  # type: ignore[arg-type]

    def ping(self) -> bool:
        try:
            return bool(self._r.ping())
        except redis.RedisError:
            return False

    def clear(self) -> None:
        """Empties the whole Redis database. Only for tests."""
        self._r.flushdb()


@lru_cache
def get_cache() -> Cache:
    url = get_settings().redis_url
    return RedisCache(url) if url else MemoryCache()

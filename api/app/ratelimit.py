"""Limits failed sign-ins per client address, to slow down password guessing.

The count lives in the shared cache (Redis in production), so it holds across API instances.
Each attempt is counted *before* the password is checked, in one atomic INCR, so a burst of
parallel requests can't all slip past the check. A successful sign-in gives its slot back.
"""

import logging

from app.cache import get_cache
from app.config import get_settings
from app.errors import AppError

log = logging.getLogger(__name__)
WINDOW_SECONDS = 60


def _key(client: str) -> str:
    return f"login-fail:{client}"


def reserve_login_attempt(client: str) -> None:
    """Raises 429 if this client has failed too often in the last minute."""
    cache = get_cache()
    try:
        attempts = cache.incr(_key(client), WINDOW_SECONDS)
        if attempts > get_settings().login_attempts_per_minute:
            wait = cache.ttl(_key(client)) or WINDOW_SECONDS
            raise AppError(
                429,
                f"Too many failed sign-ins. Try again in {wait} seconds.",
                headers={"Retry-After": str(wait)},
            )
    except AppError:
        raise
    except Exception:  # cache down: let people sign in rather than lock everyone out
        log.warning("login rate limiter unavailable", exc_info=True)


def release_login_attempt(client: str) -> None:
    try:
        get_cache().decr(_key(client))
    except Exception:
        log.warning("login rate limiter unavailable", exc_info=True)

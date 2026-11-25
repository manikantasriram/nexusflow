"""One error shape for the whole API.

Every error response looks like:

    {"error": {"code": "not_found", "message": "Project not found", "fields": {...}}}

`code` is stable for programs to check, `message` is readable for people, and `fields` (only on
validation errors) maps each bad input field to what is wrong with it.
"""

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

CODES = {
    400: "bad_request",
    401: "unauthorized",
    403: "forbidden",
    404: "not_found",
    409: "conflict",
    413: "payload_too_large",
    415: "unsupported_media_type",
    422: "validation_error",
    429: "rate_limited",
}


class AppError(Exception):
    """Raise this from services; the handler turns it into the JSON shape above."""

    def __init__(self, status: int, message: str, code: str | None = None, headers: dict | None = None):
        self.status = status
        self.message = message
        self.code = code or CODES.get(status, "error")
        self.headers = headers
        super().__init__(message)


def not_found(what: str) -> AppError:
    return AppError(404, f"{what} not found")


def _body(code: str, message: str, fields: dict[str, str] | None = None) -> dict:
    error: dict = {"code": code, "message": message}
    if fields:
        error["fields"] = fields
    return {"error": error}


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def _app_error(_: Request, exc: AppError) -> JSONResponse:
        return JSONResponse(_body(exc.code, exc.message), status_code=exc.status, headers=exc.headers)

    @app.exception_handler(StarletteHTTPException)
    async def _http_error(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        code = CODES.get(exc.status_code, "error")
        return JSONResponse(
            _body(code, str(exc.detail)), status_code=exc.status_code, headers=getattr(exc, "headers", None)
        )

    @app.exception_handler(RequestValidationError)
    async def _validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
        fields: dict[str, str] = {}
        for err in exc.errors():
            loc = [str(p) for p in err.get("loc", ()) if p not in ("body", "query", "path")]
            key = ".".join(loc) or "request"
            fields.setdefault(key, str(err.get("msg", "Invalid value")).removeprefix("Value error, "))
        return JSONResponse(_body("validation_error", "Some fields are invalid", fields), status_code=422)

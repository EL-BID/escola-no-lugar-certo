from __future__ import annotations

from urllib.parse import urlsplit

from django.conf import settings
from django.http import JsonResponse


class FrontendOriginGateMiddleware:
    """Best-effort gate to reduce non-frontend API traffic.

    This middleware validates Origin/Referer against an allowlist for API paths.
    It is intentionally configurable and can be disabled in development.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    @staticmethod
    def _normalize_origin(url: str | None) -> str | None:
        if not url:
            return None
        parsed = urlsplit(url)
        if not parsed.scheme or not parsed.netloc:
            return None
        return f"{parsed.scheme}://{parsed.netloc}".lower()

    def __call__(self, request):
        if not getattr(settings, 'API_FRONTEND_ONLY_ENFORCED', False):
            return self.get_response(request)

        path = request.path or '/'
        path_prefixes = getattr(settings, 'API_FRONTEND_ONLY_PATH_PREFIXES', ('/api/',))
        if not any(path.startswith(prefix) for prefix in path_prefixes):
            return self.get_response(request)

        allowed_origins = {
            origin.lower()
            for origin in getattr(settings, 'API_FRONTEND_ONLY_ALLOWED_ORIGINS', [])
            if origin
        }
        if not allowed_origins:
            return JsonResponse(
                {'detail': 'API gate misconfigured: allowed origins list is empty.'},
                status=503,
            )

        origin = self._normalize_origin(request.headers.get('Origin'))
        referer_origin = self._normalize_origin(request.headers.get('Referer'))

        if origin in allowed_origins or referer_origin in allowed_origins:
            return self.get_response(request)

        return JsonResponse(
            {
                'detail': (
                    'Access denied. Requests must originate from an approved frontend origin.'
                )
            },
            status=403,
        )

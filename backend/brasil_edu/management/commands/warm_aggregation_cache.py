from time import perf_counter

from django.core.management.base import BaseCommand, CommandError
from rest_framework.test import APIRequestFactory

from brasil_edu.models import Municipality, State
from brasil_edu.views import HexagonViewSet


class Command(BaseCommand):
    help = (
        "Prewarm education-data cache keys by executing lightweight first-page "
        "requests for selected states/municipalities and resolutions."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--state-code",
            action="append",
            required=True,
            help="State code to prewarm (repeatable)",
        )
        parser.add_argument(
            "--municipality-code",
            action="append",
            default=[],
            help="Optional municipality IBGE code to prewarm (repeatable)",
        )
        parser.add_argument(
            "--resolution",
            action="append",
            type=int,
            default=[5],
            help="Resolution to prewarm (repeatable)",
        )
        parser.add_argument(
            "--page-size",
            type=int,
            default=1,
            help="Response page size used for warmup requests (default: 1)",
        )
        parser.add_argument(
            "--skip-count-probe",
            action="store_true",
            help="Skip count_only preflight and warm only data page cache keys",
        )

    def handle(self, *args, **options):
        state_codes = sorted(set(options["state_code"]))
        municipality_codes = sorted(set(options["municipality_code"]))
        resolutions = sorted(set(options["resolution"]))
        page_size = max(1, int(options["page_size"]))
        skip_count_probe = bool(options.get("skip_count_probe"))

        missing_states = [code for code in state_codes if not State.objects.filter(code=code).exists()]
        if missing_states:
            raise CommandError(f"Unknown state codes: {', '.join(missing_states)}")

        valid_municipalities = set(
            Municipality.objects.filter(code_ibge__in=municipality_codes).values_list("code_ibge", flat=True)
        )
        missing_municipalities = [code for code in municipality_codes if code not in valid_municipalities]
        if missing_municipalities:
            raise CommandError(f"Unknown municipality codes: {', '.join(missing_municipalities)}")

        factory = APIRequestFactory()
        view = HexagonViewSet.as_view({"get": "education_data"})

        scenarios = []
        for state_code in state_codes:
            scenarios.append({"state": state_code, "municipality_code": None})

        for municipality_code in municipality_codes:
            municipality_state = (
                Municipality.objects.filter(code_ibge=municipality_code)
                .values_list("state__code", flat=True)
                .first()
            )
            if municipality_state in state_codes:
                scenarios.append(
                    {
                        "state": municipality_state,
                        "municipality_code": municipality_code,
                    }
                )

        if not scenarios:
            raise CommandError("No valid warmup scenarios were generated")

        self.stdout.write(
            self.style.NOTICE(
                (
                    "Starting warmup: "
                    f"{len(scenarios)} scenarios x {len(resolutions)} resolutions"
                )
            )
        )

        total_runs = 0
        for scenario in scenarios:
            for resolution in resolutions:
                params = {
                    "state": scenario["state"],
                    "resolution": resolution,
                    "education_levels": "INF_CRE",
                    "compact": "true",
                    "page": 1,
                    "page_size": page_size,
                }

                if scenario["municipality_code"]:
                    params["municipality_code"] = scenario["municipality_code"]

                total_count = 0
                count_elapsed = 0.0

                if not skip_count_probe:
                    count_request = factory.get("/api/v1/hexagons/education-data/", {
                        **params,
                        "count_only": "true",
                    })

                    started_count = perf_counter()
                    count_response = view(count_request)
                    count_response.render()
                    count_elapsed = perf_counter() - started_count

                    if count_response.status_code >= 400:
                        raise CommandError(
                            "Warmup count request failed "
                            f"state={scenario['state']} municipality={scenario['municipality_code']} "
                            f"resolution={resolution} status={count_response.status_code}"
                        )

                    total_count = (
                        (count_response.data or {}).get("metadata", {}).get("total_count")
                        or (count_response.data or {}).get("count")
                        or 0
                    )

                    data_query = {
                        **params,
                        "skip_total_count": "true",
                        "total_count_hint": total_count,
                    }
                else:
                    data_query = {
                        **params,
                        "skip_total_count": "true",
                    }

                data_request = factory.get("/api/v1/hexagons/education-data/", data_query)

                started_data = perf_counter()
                data_response = view(data_request)
                data_response.render()
                data_elapsed = perf_counter() - started_data

                if data_response.status_code >= 400:
                    raise CommandError(
                        "Warmup page request failed "
                        f"state={scenario['state']} municipality={scenario['municipality_code']} "
                        f"resolution={resolution} status={data_response.status_code}"
                    )

                metadata = (data_response.data or {}).get("metadata", {})
                total_runs += 1
                self.stdout.write(
                    (
                        "warmed "
                        f"state={scenario['state']} "
                        f"municipality={scenario['municipality_code'] or 'all'} "
                        f"res={resolution} "
                        f"count_total={total_count} "
                        f"count_t={count_elapsed:.3f}s "
                        f"page_t={data_elapsed:.3f}s "
                        f"skip_count_probe={skip_count_probe} "
                        f"aggregated={metadata.get('aggregated')} "
                        f"agg_cache_hit={metadata.get('aggregation_cached')} "
                        f"count_cache_hit={metadata.get('direct_count_cached')}"
                    )
                )

        self.stdout.write(self.style.SUCCESS(f"Warmup complete. Executed {total_runs} scenario runs."))

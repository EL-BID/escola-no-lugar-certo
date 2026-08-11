from time import perf_counter

from django.core.management.base import BaseCommand, CommandError

from brasil_edu.models import Municipality, State
from brasil_edu.services.hexagon_rollups import (
    ROLLUP_RESOLUTION,
    SOURCE_RESOLUTION,
    refresh_municipality_rollups_for_state,
    refresh_rollups_for_scope,
)


class Command(BaseCommand):
    help = "Precompute serving-layer H3 rollups from canonical resolution-8 hexagons."

    def add_arguments(self, parser):
        parser.add_argument(
            "--state-code",
            action="append",
            required=True,
            help="State code to precompute (repeatable).",
        )
        parser.add_argument(
            "--resolution",
            action="append",
            type=int,
            help=(
                "Target H3 resolution to precompute (repeatable). "
                "Defaults to state resolution 5, or municipality resolutions 5/6/7."
            ),
        )
        parser.add_argument(
            "--municipality-code",
            action="append",
            help="Municipality IBGE code to precompute (repeatable).",
        )
        parser.add_argument(
            "--all-municipalities",
            action="store_true",
            help="Precompute all municipalities in the selected state(s).",
        )
        parser.add_argument(
            "--source-resolution",
            type=int,
            default=SOURCE_RESOLUTION,
            help="Canonical source H3 resolution (default: 8).",
        )

    def handle(self, *args, **options):
        state_codes = sorted(set(options["state_code"]))
        requested_resolutions = options.get("resolution") or []
        source_resolution = int(options["source_resolution"])
        municipality_codes = sorted(set(options.get("municipality_code") or []))
        all_municipalities = bool(options.get("all_municipalities"))

        if municipality_codes and all_municipalities:
            raise CommandError("Use either --municipality-code or --all-municipalities, not both.")

        default_resolutions = [5, 6, 7] if (municipality_codes or all_municipalities) else [ROLLUP_RESOLUTION]
        target_resolutions = sorted(set(int(resolution) for resolution in (requested_resolutions or default_resolutions)))

        invalid_resolutions = [
            resolution for resolution in target_resolutions
            if resolution >= source_resolution
        ]
        if invalid_resolutions:
            raise CommandError(
                "Target resolution must be coarser than source resolution: "
                + ", ".join(str(resolution) for resolution in invalid_resolutions)
            )

        missing_states = [
            code for code in state_codes
            if not State.objects.filter(code=code).exists()
        ]
        if missing_states:
            raise CommandError(f"Unknown state codes: {', '.join(missing_states)}")

        for state_code in state_codes:
            state = State.objects.get(code=state_code)
            if all_municipalities:
                for target_resolution in target_resolutions:
                    self._refresh_all_municipalities_scope(
                        state_code=state_code,
                        target_resolution=target_resolution,
                        source_resolution=source_resolution,
                    )
                continue
            else:
                scoped_municipality_codes = municipality_codes

            if scoped_municipality_codes:
                missing_codes = [
                    code for code in scoped_municipality_codes
                    if not Municipality.objects.filter(state=state, code_ibge=code).exists()
                ]
                if missing_codes:
                    raise CommandError(
                        f"Unknown municipality codes for state {state_code}: {', '.join(missing_codes)}"
                    )

            if not municipality_codes and not all_municipalities:
                for target_resolution in target_resolutions:
                    self._refresh_scope(
                        state_code=state_code,
                        target_resolution=target_resolution,
                        source_resolution=source_resolution,
                        municipality_code=None,
                    )

            for municipality_code in scoped_municipality_codes:
                for target_resolution in target_resolutions:
                    self._refresh_scope(
                        state_code=state_code,
                        target_resolution=target_resolution,
                        source_resolution=source_resolution,
                        municipality_code=municipality_code,
                    )

    def _refresh_scope(self, state_code, target_resolution, source_resolution, municipality_code=None):
        started_at = perf_counter()
        count = refresh_rollups_for_scope(
            state_code,
            target_resolution=target_resolution,
            source_resolution=source_resolution,
            municipality_code=municipality_code,
        )
        elapsed = perf_counter() - started_at
        scope = f"municipality={municipality_code}" if municipality_code else "state"
        self.stdout.write(
            self.style.SUCCESS(
                f"precomputed state={state_code} {scope} target_res={target_resolution} "
                f"source_res={source_resolution} rollups={count} elapsed_s={elapsed:.2f}"
            )
        )

    def _refresh_all_municipalities_scope(self, state_code, target_resolution, source_resolution):
        started_at = perf_counter()
        count = refresh_municipality_rollups_for_state(
            state_code,
            target_resolution=target_resolution,
            source_resolution=source_resolution,
        )
        elapsed = perf_counter() - started_at
        self.stdout.write(
            self.style.SUCCESS(
                f"precomputed state={state_code} all_municipalities target_res={target_resolution} "
                f"source_res={source_resolution} rollups={count} elapsed_s={elapsed:.2f}"
            )
        )

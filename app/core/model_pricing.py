"""Model pricing — USD per 1M tokens.

There are NO built-in models or prices. The entire catalog is user-configured via
Config → Models (stored in the ``model_pricing`` table, workspace-scoped). Cost is
computed purely from what the user has entered — an unpriced/unknown model resolves
to zero cost rather than a guessed default.

Per-session pricing is snapshotted when a session's cost is first computed (see
``app.repositories.pricing_snapshot_repo``) so that editing a model's price — or
changing an agent's model — later never re-prices sessions that already ran.
"""

from __future__ import annotations

# No fallback guess: a model the user hasn't priced costs zero, not an assumed rate.
ZERO_PRICING: tuple[float, float] = (0.0, 0.0)


def match_pricing(model: str | None, pricing: dict[str, tuple[float, float]]) -> tuple[float, float]:
    """Resolve (input, output) per-1M price for a model name against a pricing map.

    Tries an exact (case-insensitive) match first, then a substring match so
    provider-prefixed names like ``models/gemini-2.0-flash`` still resolve to a
    configured ``gemini-2.0-flash``. Returns ``(0, 0)`` when the user hasn't
    priced the model.
    """
    if not model:
        return ZERO_PRICING
    m = model.lower()
    lower = {k.lower(): v for k, v in pricing.items()}
    if m in lower:
        return lower[m]
    for key, price in lower.items():
        if key and key in m:
            return price
    return ZERO_PRICING


def cost_for(
    model: str | None,
    input_tokens: int,
    output_tokens: int,
    pricing: dict[str, tuple[float, float]],
) -> float:
    """Compute USD cost for token counts under a model's pricing."""
    inp, out = match_pricing(model, pricing)
    return (input_tokens * inp + output_tokens * out) / 1_000_000

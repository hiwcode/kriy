"""Model pricing — USD per 1M tokens.

Cost is resolved from a merge of these built-in defaults and any workspace-scoped
overrides/additions stored in the ``model_pricing`` table (DB wins). Keeping a
built-in base means cost estimates work out of the box, and users can add their own
models (e.g. Claude, GPT) or correct a price from Config → Models.
"""

from __future__ import annotations

# name -> (input_per_million, output_per_million). Mirror the values the UI has
# shipped so estimates are consistent before anyone customizes them.
DEFAULT_MODEL_PRICING: dict[str, tuple[float, float]] = {
    "gemini-3.1-flash-lite": (0.15, 0.60),
    "gemini-2.5-pro": (1.25, 10.0),
    "gemini-2.5-flash": (0.30, 2.50),
    "gemini-2.0-flash": (0.10, 0.40),
    "gemini-1.5-flash": (0.075, 0.30),
    "gemini-1.5-pro": (1.25, 5.0),
    "gemini-1.0-pro": (0.50, 1.50),
}

# Fallback when a model has no exact or substring match in the catalog.
FALLBACK_PRICING: tuple[float, float] = (0.15, 0.60)


def match_pricing(model: str | None, pricing: dict[str, tuple[float, float]]) -> tuple[float, float]:
    """Resolve (input, output) per-1M price for a model name against a pricing map.

    Tries an exact (case-insensitive) match first, then a substring match so
    provider-prefixed names like ``models/gemini-2.0-flash`` still resolve.
    """
    if not model:
        return FALLBACK_PRICING
    m = model.lower()
    lower = {k.lower(): v for k, v in pricing.items()}
    if m in lower:
        return lower[m]
    for key, price in lower.items():
        if key and key in m:
            return price
    return FALLBACK_PRICING


def cost_for(
    model: str | None,
    input_tokens: int,
    output_tokens: int,
    pricing: dict[str, tuple[float, float]],
) -> float:
    """Compute USD cost for token counts under a model's pricing."""
    inp, out = match_pricing(model, pricing)
    return (input_tokens * inp + output_tokens * out) / 1_000_000

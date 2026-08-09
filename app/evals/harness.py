"""Evaluation harness — run prompts against models and score the outputs.

Usage:
    uv run python -m app.evals.harness \
        --dataset app/evals/datasets/smoke.jsonl \
        --models "ollama_chat/qwen3:8b,gemini-2.0-flash" \
        --judge-model gemini-2.0-flash \
        --pricing app/evals/pricing.example.json \
        --json out.json

Dataset: one JSON object per line (see datasets/smoke.jsonl):
    {"id": "...", "prompt": "...", "assert": {"type": "contains", "value": "hi"}}
    assert.type ∈ {contains, equals, regex, judge}. `judge` uses --judge-model
    against `rubric`.

Exit code is non-zero if any case fails or errors, so it drops into CI.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import re
import sys
import time
from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import Any

from app.core.model_pricing import cost_for
from app.services.run_errors import classify_run_error

Pricing = dict[str, tuple[float, float]]


# --------------------------------------------------------------------------- #
#  Scoring (pure — unit-testable without a model)                             #
# --------------------------------------------------------------------------- #

def score_assertion(assertion: dict[str, Any], output: str) -> tuple[bool, str]:
    """Score a non-judge assertion against model output. Returns (passed, detail)."""
    kind = (assertion or {}).get("type", "contains")
    out = output or ""
    if kind == "contains":
        want = str(assertion.get("value", ""))
        ok = want.lower() in out.lower()
        return ok, f"expected to contain {want!r}"
    if kind == "equals":
        want = str(assertion.get("value", ""))
        ok = out.strip() == want.strip()
        return ok, f"expected to equal {want!r}"
    if kind == "regex":
        pattern = str(assertion.get("value", ""))
        ok = re.search(pattern, out) is not None
        return ok, f"expected to match /{pattern}/"
    if kind == "judge":
        # Judged separately (needs a model); never scored here.
        return False, "judge assertion requires a judge model"
    return False, f"unknown assertion type {kind!r}"


# --------------------------------------------------------------------------- #
#  Result types                                                                #
# --------------------------------------------------------------------------- #

@dataclass
class CaseResult:
    model: str
    case_id: str
    passed: bool
    status: str            # pass | fail | error
    detail: str
    latency_ms: int = 0
    input_tokens: int = 0
    output_tokens: int = 0
    cost: float = 0.0
    output: str = ""


@dataclass
class Suite:
    results: list[CaseResult] = field(default_factory=list)

    def by_model(self) -> dict[str, list[CaseResult]]:
        out: dict[str, list[CaseResult]] = {}
        for r in self.results:
            out.setdefault(r.model, []).append(r)
        return out


# --------------------------------------------------------------------------- #
#  Model calls                                                                 #
# --------------------------------------------------------------------------- #

async def _complete(model: str, prompt: str, timeout: float) -> tuple[str, int, int]:
    """Call a model via litellm; return (text, input_tokens, output_tokens)."""
    import litellm  # imported lazily so scorers are testable without litellm configured

    resp = await litellm.acompletion(
        model=model,
        messages=[{"role": "user", "content": prompt}],
        timeout=timeout,
    )
    text = resp.choices[0].message.content or ""
    usage = getattr(resp, "usage", None)
    in_tok = int(getattr(usage, "prompt_tokens", 0) or 0)
    out_tok = int(getattr(usage, "completion_tokens", 0) or 0)
    return text, in_tok, out_tok


async def _judge(judge_model: str, rubric: str, prompt: str, output: str, timeout: float) -> tuple[bool, str]:
    """LLM-as-judge: ask judge_model whether `output` satisfies `rubric`."""
    instruction = (
        "You are a strict evaluator. Given a task, a candidate answer, and a rubric, "
        "decide if the answer satisfies the rubric. Reply with a single line: "
        "'PASS: <reason>' or 'FAIL: <reason>'.\n\n"
        f"TASK:\n{prompt}\n\nRUBRIC:\n{rubric}\n\nCANDIDATE ANSWER:\n{output}"
    )
    text, _, _ = await _complete(judge_model, instruction, timeout)
    verdict = text.strip().upper().startswith("PASS")
    return verdict, text.strip()[:300]


async def run_case(
    model: str, case: dict[str, Any], *, judge_model: str | None, pricing: Pricing, timeout: float
) -> CaseResult:
    case_id = str(case.get("id", "?"))
    prompt = str(case.get("prompt", ""))
    assertion = case.get("assert") or {}
    started = time.monotonic()
    try:
        output, in_tok, out_tok = await _complete(model, prompt, timeout)
    except Exception as exc:  # noqa: BLE001 — record, don't crash the suite
        err = classify_run_error(exc)
        return CaseResult(model, case_id, False, "error", f"{err.kind}: {exc}",
                          latency_ms=int((time.monotonic() - started) * 1000))
    latency_ms = int((time.monotonic() - started) * 1000)

    if assertion.get("type") == "judge":
        if not judge_model:
            passed, detail = False, "no --judge-model provided for judge assertion"
        else:
            try:
                passed, detail = await _judge(judge_model, str(assertion.get("rubric", "")), prompt, output, timeout)
            except Exception as exc:  # noqa: BLE001
                passed, detail = False, f"judge failed: {exc}"
    else:
        passed, detail = score_assertion(assertion, output)

    return CaseResult(
        model=model, case_id=case_id, passed=passed, status="pass" if passed else "fail",
        detail=detail, latency_ms=latency_ms, input_tokens=in_tok, output_tokens=out_tok,
        cost=round(cost_for(model, in_tok, out_tok, pricing), 6), output=output[:500],
    )


async def run_suite(
    models: list[str], cases: list[dict[str, Any]], *,
    judge_model: str | None, pricing: Pricing, timeout: float,
) -> Suite:
    suite = Suite()
    # Sequential per (model, case) to stay gentle on rate limits and local models.
    for model in models:
        for case in cases:
            suite.results.append(
                await run_case(model, case, judge_model=judge_model, pricing=pricing, timeout=timeout)
            )
    return suite


# --------------------------------------------------------------------------- #
#  I/O + CLI                                                                   #
# --------------------------------------------------------------------------- #

def load_dataset(path: str) -> list[dict[str, Any]]:
    cases = []
    for i, line in enumerate(Path(path).read_text(encoding="utf-8").splitlines(), 1):
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        try:
            cases.append(json.loads(line))
        except json.JSONDecodeError as e:
            raise SystemExit(f"{path}:{i}: invalid JSON: {e}")
    return cases


def load_pricing(path: str | None) -> Pricing:
    if not path:
        return {}
    raw = json.loads(Path(path).read_text(encoding="utf-8"))
    return {k: (float(v[0]), float(v[1])) for k, v in raw.items()}


def _print_report(suite: Suite) -> None:
    for model, results in suite.by_model().items():
        passed = sum(1 for r in results if r.passed)
        errored = sum(1 for r in results if r.status == "error")
        cost = sum(r.cost for r in results)
        toks = sum(r.input_tokens + r.output_tokens for r in results)
        avg_ms = int(sum(r.latency_ms for r in results) / max(1, len(results)))
        print(f"\n═══ {model} — {passed}/{len(results)} passed"
              f"{f', {errored} errored' if errored else ''} "
              f"· {toks} tok · ${cost:.4f} · {avg_ms}ms avg ═══")
        for r in results:
            mark = "✅" if r.passed else ("💥" if r.status == "error" else "❌")
            print(f"  {mark} {r.case_id:<20} {r.detail}")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Run an LLM eval suite.")
    ap.add_argument("--dataset", default="app/evals/datasets/smoke.jsonl")
    ap.add_argument("--models", required=True, help="Comma-separated model ids.")
    ap.add_argument("--judge-model", default=None, help="Model used for judge assertions.")
    ap.add_argument("--pricing", default=None, help="JSON file: {model: [in_per_1M, out_per_1M]}.")
    ap.add_argument("--timeout", type=float, default=120.0)
    ap.add_argument("--json", dest="json_out", default=None, help="Write full results as JSON.")
    args = ap.parse_args(argv)

    models = [m.strip() for m in args.models.split(",") if m.strip()]
    cases = load_dataset(args.dataset)
    pricing = load_pricing(args.pricing)
    if not models or not cases:
        raise SystemExit("Need at least one model and one case.")

    suite = asyncio.run(run_suite(
        models, cases, judge_model=args.judge_model, pricing=pricing, timeout=args.timeout,
    ))
    _print_report(suite)

    if args.json_out:
        Path(args.json_out).write_text(
            json.dumps([asdict(r) for r in suite.results], indent=2), encoding="utf-8"
        )
        print(f"\nWrote {args.json_out}")

    failed = [r for r in suite.results if not r.passed]
    print(f"\n{len(suite.results) - len(failed)}/{len(suite.results)} passed overall.")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())

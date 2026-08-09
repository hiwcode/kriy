# Eval harness

Run a dataset of prompts against one or more models, score the outputs, and get a
pass/fail + latency + tokens + cost report per model. Standalone: it only needs
`litellm` (already a dependency) and provider API keys in the environment. Local
Ollama models need no key.

## Run

```bash
# Compare the local default against Gemini, with an LLM judge for the JSON case
uv run python -m app.evals.harness \
  --models "ollama_chat/qwen3:8b,gemini-2.0-flash" \
  --judge-model gemini-2.0-flash \
  --pricing app/evals/pricing.example.json \
  --json /tmp/eval-out.json
```

Provider keys are read from the same env vars the app uses: `GOOGLE_API_KEY`,
`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`. Ollama must be running locally for
`ollama_chat/*` models.

Exit code is non-zero if any case fails or errors — drop it into CI once you have
keys available to a runner.

## Dataset format

One JSON object per line (`#` lines ignored). See `datasets/smoke.jsonl`.

```json
{"id": "greeting", "prompt": "Say hello", "assert": {"type": "contains", "value": "hello"}}
```

`assert.type`:

| type       | field    | passes when …                                        |
|------------|----------|------------------------------------------------------|
| `contains` | `value`  | output contains `value` (case-insensitive)           |
| `equals`   | `value`  | output equals `value` (trimmed)                      |
| `regex`    | `value`  | `re.search(value, output)` matches                   |
| `judge`    | `rubric` | `--judge-model` replies `PASS` for the rubric        |

## Pricing

Optional `--pricing` JSON maps `model → [input_per_1M, output_per_1M]` so the
report shows real cost. Omit it and cost shows `$0` (tokens/latency still shown).
The format matches the app's model catalog (`app/core/model_pricing.py`).

## Extending

- Add datasets under `datasets/*.jsonl` (e.g. per-feature regression suites).
- The scorer `score_assertion()` in `harness.py` is pure and unit-tested
  (`app/tests/test_evals.py`) — add new assertion types there.

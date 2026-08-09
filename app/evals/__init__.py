"""Lightweight LLM/agent evaluation harness.

Run a dataset of prompts against one or more models, score the outputs
(contains / equals / regex / LLM-as-judge), and report pass/fail, latency, tokens
and cost per model. Standalone — needs only litellm and provider env keys (local
Ollama models need none). See ``app/evals/README.md``.
"""

from __future__ import annotations

from functools import lru_cache

import tiktoken

from app.core.config import settings


@lru_cache(maxsize=4)
def _get_encoding(model: str | None, encoding_name: str | None) -> tiktoken.Encoding:
    if model:
        try:
            return tiktoken.encoding_for_model(model)
        except Exception:
            pass
    if encoding_name:
        try:
            return tiktoken.get_encoding(encoding_name)
        except Exception:
            pass
    return tiktoken.get_encoding("cl100k_base")


def count_tokens(text: str) -> int:
    encoding = _get_encoding(settings.TOKENIZER_MODEL, settings.TOKENIZER_ENCODING)
    return len(encoding.encode(text))

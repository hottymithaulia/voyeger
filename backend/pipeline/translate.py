from __future__ import annotations

import os
from abc import ABC, abstractmethod
from dataclasses import dataclass

import httpx


@dataclass
class TranslationResult:
    text: str
    needs_review: bool


class Translator(ABC):
    @abstractmethod
    def translate(self, text: str, source_lang: str, target_lang: str) -> TranslationResult:
        """Translate text from source_lang to target_lang."""


class StubTranslator(Translator):
    """Fallback translator that preserves source text and flags it for human review."""

    def translate(self, text: str, source_lang: str, target_lang: str) -> TranslationResult:
        if source_lang == target_lang:
            return TranslationResult(text=text, needs_review=False)
        return TranslationResult(text=f"[{target_lang} TODO] {text}", needs_review=True)


class LLMTranslator(Translator):
    """Optional OpenAI-compatible LLM translator enabled via TRANSLATOR_API_KEY."""

    def __init__(self, api_key: str, api_url: str | None = None, model: str | None = None) -> None:
        self.api_key = api_key
        self.api_url = api_url or os.environ.get(
            "TRANSLATOR_API_URL", "https://api.openai.com/v1/chat/completions"
        )
        self.model = model or os.environ.get("TRANSLATOR_MODEL", "gpt-4o-mini")

    def translate(self, text: str, source_lang: str, target_lang: str) -> TranslationResult:
        if source_lang == target_lang or not text.strip():
            return TranslationResult(text=text, needs_review=False)
        prompt = (
            f"Translate the following Bhopal tourism copy from {source_lang} to {target_lang}. "
            "Keep proper nouns natural and return only the translated text.\n\n"
            f"{text}"
        )
        with httpx.Client(timeout=15.0) as client:
            resp = client.post(
                self.api_url,
                headers={"Authorization": f"Bearer {self.api_key}"},
                json={
                    "model": self.model,
                    "messages": [{"role": "user", "content": prompt}],
                    "temperature": 0.2,
                },
            )
            resp.raise_for_status()
            data = resp.json()
            translated = data["choices"][0]["message"]["content"].strip()
            return TranslationResult(text=translated, needs_review=True)


def get_translator() -> Translator:
    api_key = os.environ.get("TRANSLATOR_API_KEY", "").strip()
    if api_key:
        return LLMTranslator(api_key=api_key)
    return StubTranslator()

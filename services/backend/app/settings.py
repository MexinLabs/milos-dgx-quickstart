"""Configuration from environment variables (see docs/data-contracts.md)."""

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    client_name: str
    llm_base_url: str
    llm_api_key: str
    llm_model: str
    llm_reasoning_effort: str | None
    vlm_base_url: str
    vlm_api_key: str
    vlm_model: str


def _load() -> Settings:
    env = os.environ
    return Settings(
        client_name=env.get("CLIENT_NAME", "Cliente"),
        llm_base_url=env.get("LLM_BASE_URL", "http://ollama:11434/v1"),
        llm_api_key=env.get("LLM_API_KEY", "ollama"),
        llm_model=env.get("LLM_MODEL", ""),
        llm_reasoning_effort=env.get("LLM_REASONING_EFFORT") or None,
        vlm_base_url=env.get("VLM_BASE_URL", "http://ollama:11434/v1"),
        vlm_api_key=env.get("VLM_API_KEY", "ollama"),
        vlm_model=env.get("VLM_MODEL", ""),
    )


settings = _load()

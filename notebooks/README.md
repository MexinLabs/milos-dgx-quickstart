# Notebooks

Planned; none exist yet. They run in the `jupyter` service
(NGC PyTorch container with GPU access) and read `LLM_BASE_URL`, `LLM_MODEL`
and `VLM_MODEL` from the environment.

| Notebook | Shows |
|---|---|
| `00_system_check.ipynb` | GPU, driver, CUDA and PyTorch from inside a container; CPU vs GPU benchmark |
| `01_llm.ipynb` | chat and streaming through the OpenAI API; throughput under 1, 4, 8 and 16 parallel requests |
| `02_vlm.ipynb` | image description; structured JSON extraction from an inspection photo |
| `03_agents.ipynb` | tool calling step by step: the loop the web UI visualizes |

Notebook prose is in Spanish. Each notebook must pass "Restart and run all".

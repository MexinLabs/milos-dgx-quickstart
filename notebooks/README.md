# Notebooks

They run in the `jupyter` service (NGC PyTorch container with GPU access) and
read the model server and the model names from the environment
(`LLM_BASE_URL`, `LLM_MODEL`, `VLM_MODEL`), which come from `.env`.

Open JupyterLab at http://localhost:8888 and run them in order with
**Run > Restart Kernel and Run All Cells**.

| Notebook | Shows | Needs |
|---|---|---|
| `00_system_check.ipynb` | GPU, driver, CUDA and PyTorch from inside a container; CPU vs GPU benchmark | the GPU |
| `01_llm.ipynb` | chat and streaming through the OpenAI-compatible API; throughput under 1, 4, 8 and 16 parallel requests | the text model |
| `02_vlm.ipynb` | image description; structured JSON extraction from an inspection card, checked field by field | the vision model |
| `03_agents.ipynb` | tool calling step by step, then the full loop and a hand-off: what the web UI visualizes | the text model and the backend (it creates the sample office database) |

Notebook prose is in Spanish. The notebooks are committed without outputs.
`02_vlm` draws its own test image, so no sample files are needed; to try a
photo of your own, copy it into `data/` (seen as `/workspace/data/` inside the
container).

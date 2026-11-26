"""Tools the agents can call. All of them only read."""

import shutil
import sqlite3

import httpx

from .. import gpu
from ..settings import settings
from .sample_data import DB_PATH

DOCKER_SOCKET = "/var/run/docker.sock"
MAX_ROWS = 50


def _gb(n: int) -> float:
    return round(n / 1e9, 1)


async def gpu_status() -> dict:
    return gpu.sample()


async def list_models() -> dict:
    """Models on disk and models loaded in memory (Ollama's native API)."""
    root = settings.llm_base_url.removesuffix("/").removesuffix("/v1")
    async with httpx.AsyncClient(base_url=root, timeout=10) as client:
        on_disk = (await client.get("/api/tags")).json()["models"]
        loaded = (await client.get("/api/ps")).json()["models"]
    return {
        "en_disco": [{"modelo": m["name"], "tamano_gb": _gb(m["size"])} for m in on_disk],
        "cargados_en_memoria": [
            {
                "modelo": m["name"],
                "memoria_total_gb": _gb(m["size"]),
                "memoria_gpu_gb": _gb(m.get("size_vram", 0)),
            }
            for m in loaded
        ],
    }


async def disk_usage() -> dict:
    """The filesystem that holds the repo, seen through the /data mount."""
    usage = shutil.disk_usage("/data")
    return {
        "total_gb": _gb(usage.total),
        "usado_gb": _gb(usage.used),
        "libre_gb": _gb(usage.free),
        "usado_pct": round(usage.used / usage.total * 100),
    }


async def list_containers() -> dict:
    transport = httpx.AsyncHTTPTransport(uds=DOCKER_SOCKET)
    async with httpx.AsyncClient(transport=transport, base_url="http://docker", timeout=10) as client:
        response = await client.get("/containers/json")
        response.raise_for_status()
    return {
        "contenedores": [
            {
                "nombre": c["Names"][0].lstrip("/"),
                "imagen": c["Image"],
                "estado": c["State"],
                "detalle": c["Status"],
            }
            for c in response.json()
        ]
    }


async def query_production(sql: str) -> dict:
    if not sql.lstrip().lower().startswith("select"):
        raise ValueError("Solo se permiten consultas SELECT.")
    # mode=ro: the database cannot be modified even if the statement tries to.
    connection = sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True)
    try:
        cursor = connection.execute(sql)
        rows = cursor.fetchmany(MAX_ROWS + 1)
        return {
            "columnas": [column[0] for column in cursor.description],
            "filas": rows[:MAX_ROWS],
            "truncado": len(rows) > MAX_ROWS,
        }
    finally:
        connection.close()

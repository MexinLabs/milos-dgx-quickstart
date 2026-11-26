# Agenda del workshop

Formato: sesión remota. El presentador comparte la pantalla de su DGX Spark y
cada participante repite los pasos en la suya; todo se abre en `localhost`.
Duración estimada: 3 horas.

Antes de la sesión hay que completar la preparación de
[guia-participante.md](guia-participante.md).

| # | Bloque | Min | Qué vamos a ver | Con qué |
|---|---|---|---|---|
| 1 | Bienvenida y qué es una DGX Spark | 10 | Para qué sirve la máquina y qué vamos a correr hoy | Presentación |
| 2 | Configuración inicial y verificación | 30 | Sistema, driver, Docker y GPU dentro de un contenedor | `scripts/00-preflight.sh --deep`, `nvidia-smi` |
| 3 | Contenedores con GPU y Jupyter | 25 | PyTorch usando la GPU; CPU contra GPU | Notebook `00_system_check` |
| 4 | LLM local | 30 | Chat en vivo, tokens por segundo, carga con peticiones en paralelo | Pestaña Chat, notebook `01_llm` |
| 5 | Descanso | 10 | | |
| 6 | VLM | 25 | El modelo describe una foto y extrae datos estructurados | Pestaña Visión, notebook `02_vlm` |
| 7 | Agentes | 40 | Agentes y herramientas trabajando paso a paso, con la carga de GPU al lado | Pestaña Agentes, notebook `03_agents` |
| 8 | Cierre y siguientes pasos | 10 | Qué se puede construir sobre esto; milOS | Presentación |

## Bloque 2: qué revisamos

1. `./scripts/00-preflight.sh --deep`, sección por sección.
2. `nvidia-smi`: GPU, versión del driver, procesos.
3. `free -h`: la memoria de la Spark, compartida entre CPU y GPU.
4. `docker info | grep -i runtime`: el runtime de NVIDIA.
5. `docker run --rm --gpus all ubuntu:24.04 nvidia-smi`: la GPU dentro de un contenedor.
6. NGC: de dónde salen los contenedores oficiales (`nvcr.io`).
7. `docker compose ps` y `docker compose logs -f backend`: cómo ver qué está corriendo.

## Si algo falla durante la sesión

| Síntoma | Qué hacer |
|---|---|
| Un servicio no levanta | `docker compose logs <servicio>` y compartir la salida |
| El modelo tarda en responder la primera vez | Se está cargando en memoria; esperar y repetir |
| La interfaz no abre | `docker compose ps`; si la Spark no tiene monitor, revisar el túnel SSH de la guía |

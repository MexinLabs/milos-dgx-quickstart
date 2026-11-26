# Agenda de la sesión

Formato: sesión remota que empieza con el unboxing de la DGX Spark. El
presentador comparte la pantalla de su Spark y cada participante repite los
pasos en la suya; todo se abre en `localhost`. Duración estimada: 3 horas.

Los pasos y comandos están en [guia-participante.md](guia-participante.md).
Las descargas corren en segundo plano mientras avanza la sesión.

| # | Bloque | Min | Qué vamos a ver | Descarga en segundo plano |
|---|---|---|---|---|
| 1 | Bienvenida y qué es una DGX Spark | 5 | Para qué sirve la máquina y qué vamos a correr hoy | |
| 2 | Unboxing y primer arranque | 25 | Conexión, asistente inicial, red | |
| 3 | Verificación del sistema | 20 | Driver, Docker y GPU dentro de un contenedor (`00-preflight.sh --deep`, `nvidia-smi`) | Al final: etapa 1 (8.3 GB) |
| 4 | LLM local | 25 | Chat en vivo, tokens por segundo, peticiones en paralelo | Etapa 2: Jupyter (12.9 GB) |
| 5 | VLM | 20 | El modelo describe una foto y extrae datos estructurados | |
| 6 | Descanso | 10 | | |
| 7 | Contenedores con GPU y Jupyter | 25 | PyTorch usando la GPU; CPU contra GPU; los modelos desde un notebook | Etapa 3: modelo grande (18.6 GB) |
| 8 | Agentes | 40 | Agentes y herramientas paso a paso con la carga de GPU al lado; primero con el modelo pequeño, luego con el grande | |
| 9 | Cierre y siguientes pasos | 10 | Qué se puede construir sobre esto; milOS | |

## Bloque 3: qué revisamos

1. `./scripts/00-preflight.sh --deep`, sección por sección.
2. `nvidia-smi`: GPU, versión del driver, procesos.
3. `free -h`: la memoria de la Spark, compartida entre CPU y GPU.
4. `docker info | grep -i runtime`: el runtime de NVIDIA.
5. `docker run --rm --gpus all ubuntu:24.04 nvidia-smi`: la GPU dentro de un contenedor.
6. NGC: de dónde salen los contenedores oficiales (`nvcr.io`).

## Bloque 8: mismo código, otro modelo

Los agentes se corren primero con `qwen3:4b-instruct`. Cuando termina la
etapa 3 se cambia `LLM_MODEL` a `qwen3:30b-instruct` y se repite la misma
pregunta, para comparar qué tan bien usa las herramientas cada modelo.

## Si algo falla durante la sesión

| Síntoma | Qué hacer |
|---|---|
| Un servicio no levanta | `docker compose logs <servicio>` y compartir la salida |
| El modelo tarda en responder la primera vez | Se está cargando en memoria; esperar y repetir |
| La interfaz no abre | `docker compose ps`; si la Spark no tiene monitor, revisar el túnel SSH de la guía |
| Una descarga va lenta | Seguir con el modelo pequeño; el grande se puede terminar después |

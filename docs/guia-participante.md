# Guía del participante

La sesión es remota y empieza con la DGX Spark recién sacada de la caja. Cada
quien trabaja en su propia Spark y abre todo en `localhost`; el presentador
comparte su pantalla y ustedes repiten los mismos pasos.

No hay que preparar nada antes. Las descargas se hacen durante la sesión, por
etapas, mientras se explica otra cosa:

| Etapa | Qué se descarga | Tamaño | A 100 Mbps |
|---|---|---|---|
| 1 | Servidor de modelos y los dos modelos pequeños | 8.3 GB | 11 min |
| 2 | Contenedor de Jupyter con PyTorch | 12.9 GB | 17 min |
| 3 | Modelo grande para los agentes | 18.6 GB | 25 min |

## Paso 0. Primer arranque

1. Conectar la Spark y completar el asistente de primer arranque siguiendo al
   presentador (usuario, red).
2. Comprobar que hay internet y abrir una terminal.

## Paso 1. Docker y el repositorio

```bash
docker ps
```

Si responde `permission denied`, el usuario todavía no puede usar Docker sin `sudo`:

```bash
sudo usermod -aG docker $USER
newgrp docker
```

Clonar el repositorio y revisar la máquina:

```bash
git clone https://github.com/MexinLabs/milos-dgx-quickstart.git
cd milos-dgx-quickstart
./scripts/00-preflight.sh --deep
```

El resumen debe terminar con `0 failures`.

## Paso 2. Etapa 1: modelos pequeños e interfaz

```bash
cp .env.dgx.example .env
./scripts/download-model.sh
docker compose up -d --build ollama backend frontend
```

Al terminar, la interfaz está en http://localhost:5173. Tiene tres pestañas y,
a la derecha, el panel de GPU, que se ve desde cualquiera de ellas:

| Pestaña | Qué hace |
|---|---|
| Chat | Conversación con el modelo de texto; cada respuesta muestra sus tokens por segundo |
| Visión | Se carga una imagen (arrastrar, elegir o pegar) y se le pregunta al modelo de visión |
| Agentes | Se elige un escenario y se ve qué agente trabaja, qué herramienta llama y qué le responde |

El escenario "Inspector de oficina" pide una foto. Tomen una con el celular
del lugar donde están: un escritorio, una sala de juntas, el rincón donde quedó
la Spark con sus cables. También sirve la foto de una hoja con datos (una
bitácora, un registro): el agente la lee y la compara con la base de datos.

## Paso 3. Etapa 2: Jupyter (en otra terminal, en segundo plano)

Abrir una segunda terminal en la carpeta del repositorio y dejarla trabajando:

```bash
docker compose up -d --build jupyter
```

Cuando termine, JupyterLab está en http://localhost:8888 (token: `workshop`).
Los notebooks se abren en orden y cada uno se ejecuta completo con el menú
**Run > Restart Kernel and Run All Cells**:

| Notebook | Qué muestra |
|---|---|
| `00_system_check` | La GPU, el driver y PyTorch desde un contenedor; CPU contra GPU |
| `01_llm` | El modelo de texto desde Python; tokens por segundo con peticiones en paralelo |
| `02_vlm` | El modelo de visión: describir una imagen y sacar sus datos en JSON |
| `03_agents` | Un agente con herramientas, construido paso a paso |

## Paso 4. Etapa 3: el modelo grande (en segundo plano)

En la segunda terminal, cuando acabe la etapa 2:

```bash
./scripts/download-model.sh qwen3:30b-instruct
```

En cuanto termina la descarga, el modelo aparece en el selector "Modelo de
texto" de la interfaz (arriba a la derecha). Al elegirlo ahí, el chat y los
agentes lo usan de inmediato, sin reiniciar nada: así se repite la misma
pregunta con los dos modelos y se comparan.

Para dejarlo como modelo predeterminado, cambiar una línea en `.env`:

```bash
LLM_MODEL=qwen3:30b-instruct
```

y reiniciar los servicios que lo usan:

```bash
docker compose up -d backend jupyter
```

Es el mismo código con otro modelo: lo único que cambió fue la configuración.

## Direcciones

| Qué | Dirección |
|---|---|
| Interfaz web | http://localhost:5173 |
| JupyterLab | http://localhost:8888 (token: `workshop`) |
| Explorador de la API | http://localhost:8000/docs |

### Si la Spark no tiene monitor

Desde su laptop, abran un túnel y usen las mismas direcciones `localhost`:

```bash
ssh -L 5173:localhost:5173 -L 8888:localhost:8888 -L 8000:localhost:8000 <usuario>@<nombre-o-ip-de-la-spark>
```

## Después de la sesión

Otros modelos que vale la pena probar, con el mismo comando de descarga:

| Modelo | Tamaño | Para qué |
|---|---|---|
| `qwen3-vl:8b-instruct` | 6.2 GB | Mejor visión; se activa con `VLM_MODEL` en `.env` |
| `qwen3-vl:32b-instruct` | 20.9 GB | La mejor visión |
| `qwen3-next:80b` | 50.4 GB | Un modelo de 80B que no cabe en una estación de trabajo normal |

Para apagar todo:

```bash
docker compose down
```

Los modelos quedan guardados en la Spark. Para liberar el espacio:

```bash
docker compose down --volumes
```

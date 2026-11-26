# Guía del participante

El workshop es remoto. Cada quien trabaja en su propia DGX Spark y abre todo en
`localhost`; el presentador comparte su pantalla y ustedes siguen los mismos pasos.

## Antes de la sesión (hacerlo el día anterior)

Las descargas suman cerca de 115 GB (unos 65 GB sin el modelo opcional), así
que no se pueden dejar para la sesión.

1. La Spark ya pasó por la configuración de primer arranque, tiene internet y
   pueden abrir una terminal en ella.

2. Su usuario puede usar Docker sin `sudo`:

   ```bash
   docker ps
   ```

   Si responde `permission denied`:

   ```bash
   sudo usermod -aG docker $USER
   newgrp docker
   ```

3. Clonar el repositorio y revisar la máquina:

   ```bash
   git clone https://github.com/MexinLabs/milos-dgx-quickstart.git
   cd milos-dgx-quickstart
   ./scripts/00-preflight.sh --deep
   ```

   El resumen debe terminar con `0 failures`. Si no, mándenos la salida completa.

4. Descargar imágenes y modelos:

   ```bash
   cp .env.dgx.example .env
   docker compose build
   ./scripts/download-model.sh
   ```

   Para ahorrar 50 GB pueden borrar la línea `SHOWCASE_MODEL` de `.env` antes
   de descargar; solo se pierde la demostración del modelo grande.

5. Comprobar que todo levanta:

   ```bash
   docker compose up -d
   docker compose ps
   ```

   Los cuatro servicios (`ollama`, `backend`, `frontend`, `jupyter`) deben
   aparecer como `running`.

## Durante la sesión

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

## Al terminar

```bash
docker compose down
```

Los modelos quedan guardados en la Spark. Para liberar el espacio:

```bash
docker compose down --volumes
```

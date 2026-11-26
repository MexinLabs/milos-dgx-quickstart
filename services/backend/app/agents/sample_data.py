"""Synthetic shift data for the "Inspector de turno" scenario.

Rebuilt at every backend start so that "ayer" in a question always has data.
The numbers are invented; one problem is planted on purpose so the analyst has
something to find: line L2, night shift, scrap and downtime rising over the
last four days.
"""

import random
import sqlite3
from datetime import date, timedelta
from pathlib import Path

DB_PATH = Path("/data/produccion.sqlite")

DAYS = 14
SHIFTS = ["matutino", "vespertino", "nocturno"]
LINES = ["L1", "L2", "L3"]
DEFECTS = ["rebaba", "porosidad", "dimensional", "rayado superficial"]
STOP_CAUSES = ["cambio de modelo", "falta de material", "ajuste de herramental", "atasco en banda"]

SCHEMA = """
CREATE TABLE produccion (
    fecha TEXT,              -- AAAA-MM-DD
    turno TEXT,              -- matutino | vespertino | nocturno
    linea TEXT,              -- L1 | L2 | L3
    piezas_producidas INTEGER,
    piezas_scrap INTEGER,
    paro_min INTEGER,        -- minutos de paro no planeado
    defecto_principal TEXT,
    causa_paro TEXT
)
"""


def build() -> None:
    rng = random.Random(7)
    today = date.today()
    rows = []
    for days_ago in range(DAYS, 0, -1):
        day = today - timedelta(days=days_ago)
        for shift in SHIFTS:
            for line in LINES:
                produced = rng.randint(1150, 1300)
                scrap_rate = rng.uniform(0.012, 0.025)
                downtime = rng.randint(5, 25)
                defect = rng.choice(DEFECTS[:3])
                cause = rng.choice(STOP_CAUSES[:3])
                if line == "L2" and shift == "nocturno" and days_ago <= 4:
                    severity = 5 - days_ago  # 1 (four days ago) .. 4 (yesterday)
                    scrap_rate = 0.03 + 0.018 * severity
                    downtime = 30 + 15 * severity
                    produced -= 60 * severity
                    defect = "rayado superficial"
                    cause = "atasco en banda"
                rows.append(
                    (day.isoformat(), shift, line, produced, round(produced * scrap_rate), downtime, defect, cause)
                )

    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    DB_PATH.unlink(missing_ok=True)
    connection = sqlite3.connect(DB_PATH)
    with connection:
        connection.execute(SCHEMA)
        connection.executemany("INSERT INTO produccion VALUES (?, ?, ?, ?, ?, ?, ?, ?)", rows)
    connection.close()

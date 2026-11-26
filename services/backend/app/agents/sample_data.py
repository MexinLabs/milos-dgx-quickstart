"""Synthetic office data for the "Inspector de oficina" scenario.

Rebuilt at every backend start so that "ayer" in a question always has data.
The numbers are invented; one problem is planted on purpose so the analyst has
something to find: floor "piso 2", at night, the air conditioning failing more
each day over the last four days (temperature, fault reports and minutes
without service all rising).
"""

import random
import sqlite3
from datetime import date, timedelta
from pathlib import Path

DB_PATH = Path("/data/oficina.sqlite")

DAYS = 14
SLOTS = ["temprano", "tarde", "noche"]
FLOORS = ["piso 1", "piso 2", "piso 3"]
# (most reported fault, its cause): everyday faults of a normal office.
FAULTS = [
    ("impresora", "atasco de papel"),
    ("red wifi", "punto de acceso saturado"),
    ("iluminación", "lámpara fundida"),
]
PLANTED_FAULT = ("aire acondicionado", "compresor apagado")

SCHEMA = """
CREATE TABLE oficina (
    fecha TEXT,                    -- AAAA-MM-DD
    horario TEXT,                  -- temprano | tarde | noche
    piso TEXT,                     -- piso 1 | piso 2 | piso 3
    temperatura_c REAL,            -- temperatura promedio del piso
    reportes INTEGER,              -- reportes de falla levantados
    minutos_sin_servicio INTEGER,  -- minutos con algún servicio caído (aire, red, luz)
    falla_principal TEXT,
    causa TEXT
)
"""


def build() -> None:
    rng = random.Random(7)
    today = date.today()
    rows = []
    for days_ago in range(DAYS, 0, -1):
        day = today - timedelta(days=days_ago)
        for slot in SLOTS:
            for floor in FLOORS:
                temperature = round(rng.uniform(21.0, 23.5), 1)
                reports = rng.randint(1, 3)
                minutes_down = rng.randint(5, 25)
                fault, cause = rng.choice(FAULTS)
                if floor == "piso 2" and slot == "noche" and days_ago <= 4:
                    severity = 5 - days_ago  # 1 (four days ago) .. 4 (yesterday)
                    temperature = 25.0 + 1.5 * severity
                    reports = 2 + 2 * severity
                    minutes_down = 30 + 15 * severity
                    fault, cause = PLANTED_FAULT
                rows.append((day.isoformat(), slot, floor, temperature, reports, minutes_down, fault, cause))

    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    DB_PATH.unlink(missing_ok=True)
    connection = sqlite3.connect(DB_PATH)
    with connection:
        connection.execute(SCHEMA)
        connection.executemany("INSERT INTO oficina VALUES (?, ?, ?, ?, ?, ?, ?, ?)", rows)
    connection.close()

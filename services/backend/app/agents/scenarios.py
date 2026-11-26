"""The agent demos: who the agents are, what they can call, and how the UI draws them."""

from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import date

from . import tools
from .orchestrator import Agent, Tool
from .sample_data import SCHEMA


@dataclass
class Scenario:
    id: str
    title: str
    description: str
    entry: str
    build: Callable[[], dict[str, Agent]]
    nodes: list[dict]
    edges: list[list[str]]
    needs_image: bool = False
    examples: list[str] = field(default_factory=list)

    def public(self) -> dict:
        return {
            "id": self.id,
            "title": self.title,
            "description": self.description,
            "needs_image": self.needs_image,
            "examples": self.examples,
            "nodes": self.nodes,
            "edges": self.edges,
        }


# --- A. DGX Ops Copilot: one agent, read-only tools about this machine ---


def _ops_copilot() -> dict[str, Agent]:
    agent = Agent(
        id="ops_copilot",
        label="DGX Ops Copilot",
        description="Responde preguntas sobre el estado de esta máquina.",
        system=(
            "Eres DGX Ops Copilot, el asistente de operación de esta máquina. "
            "Antes de responder consulta las herramientas; nunca inventes cifras. "
            "Responde en español, en pocas líneas, con los números que obtuviste y sus unidades."
        ),
        tools=[
            Tool(
                "gpu_status",
                "Estado actual de la GPU (utilización, memoria, temperatura, potencia) y memoria RAM "
                "del sistema. En equipos de memoria unificada, la memoria de la GPU es la RAM del sistema.",
                tools.gpu_status,
            ),
            Tool(
                "list_models",
                "Modelos de IA descargados en disco y cuáles están cargados en memoria ahora, con su tamaño.",
                tools.list_models,
            ),
            Tool("disk_usage", "Espacio total, usado y libre del disco, en GB.", tools.disk_usage),
            Tool(
                "list_containers",
                "Contenedores Docker en ejecución en esta máquina.",
                tools.list_containers,
            ),
        ],
    )
    return {agent.id: agent}


OPS_COPILOT = Scenario(
    id="ops_copilot",
    title="DGX Ops Copilot",
    description="Un agente que consulta el estado real de la máquina para responder.",
    entry="ops_copilot",
    build=_ops_copilot,
    examples=[
        "¿Qué modelos están cargados ahora y cuánta memoria usan?",
        "¿Me cabe otro modelo de 20 GB en memoria?",
        "Dame un resumen del estado de la máquina: GPU, disco y contenedores.",
    ],
    nodes=[
        {"id": "ops_copilot", "kind": "agent", "label": "DGX Ops Copilot", "x": 0, "y": 1.5},
        {"id": "gpu_status", "kind": "tool", "label": "Estado de GPU", "x": 1, "y": 0},
        {"id": "list_models", "kind": "tool", "label": "Modelos", "x": 1, "y": 1},
        {"id": "disk_usage", "kind": "tool", "label": "Disco", "x": 1, "y": 2},
        {"id": "list_containers", "kind": "tool", "label": "Contenedores", "x": 1, "y": 3},
    ],
    edges=[
        ["ops_copilot", "gpu_status"],
        ["ops_copilot", "list_models"],
        ["ops_copilot", "disk_usage"],
        ["ops_copilot", "list_containers"],
    ],
)


# --- B. Inspector de oficina: a supervisor and three specialists ---


def _office_inspector() -> dict[str, Agent]:
    agents = [
        Agent(
            id="supervisor",
            label="Supervisor",
            description="Coordina al equipo.",
            system=(
                "Eres el supervisor de un equipo que prepara el reporte de inspección de una oficina. "
                "Trabaja en este orden:\n"
                "1. Pide al inspector visual que analice la foto.\n"
                "2. Pide al analista de datos que revise los datos de la oficina relacionados con la "
                "pregunta del usuario y con lo que encontró el inspector.\n"
                "3. Pide al redactor el reporte final. Él recibe por su cuenta los hallazgos del inspector "
                "y del analista, y su reporte es la respuesta para el usuario.\n"
                "Haz una sola petición a la vez y no inventes hallazgos ni cifras."
            ),
            delegates=["vision_inspector", "data_analyst", "report_writer"],
        ),
        Agent(
            id="vision_inspector",
            label="Inspector visual",
            description="Analiza la foto que adjuntó el usuario y lista lo que observa.",
            system=(
                "Eres inspector visual de oficinas. Describe solo lo que se ve en la foto: mobiliario, equipo, "
                "personas y condiciones. Después lista hasta cinco hallazgos que merezcan atención "
                "(seguridad, orden, cableado, ergonomía, estado del equipo), uno por línea. "
                "Si algo no se distingue, dilo. Responde en español."
            ),
            vision=True,
        ),
        Agent(
            id="data_analyst",
            label="Analista de datos",
            description=(
                "Consulta la base de datos de la oficina: temperatura, reportes de falla y minutos sin "
                "servicio por fecha, horario y piso."
            ),
            system=(
                "Eres analista de los datos de operación de una oficina. Usa la herramienta query_office con "
                f"SQL de SQLite sobre esta tabla:\n{SCHEMA}\n"
                f"Hoy es {date.today().isoformat()}; la tabla tiene los últimos 14 días, hasta ayer. "
                "Busca qué piso y horario se salen de lo normal en temperatura, reportes de falla o minutos "
                "sin servicio. Empieza siempre con una consulta agrupada por piso y horario de todos los "
                "horarios (temperatura promedio, total de reportes y promedio de minutos sin servicio de los "
                "últimos 4 días); después consulta el detalle por fecha de la combinación que más se desvía, "
                "con su falla_principal y causa. "
                "Reporta solo cifras y textos que aparezcan en los resultados de tus consultas. "
                "Responde en español, en pocas líneas, con cifras, piso, horario y fechas."
            ),
            tools=[
                Tool(
                    "query_office",
                    "Ejecuta una consulta SELECT de SQLite sobre la tabla oficina y devuelve las filas.",
                    tools.query_office,
                    parameters={
                        "type": "object",
                        "properties": {"sql": {"type": "string", "description": "Consulta SELECT de SQLite."}},
                        "required": ["sql"],
                    },
                )
            ],
            min_tool_calls=2,
            nudge=(
                "Todavía falta el detalle. Consulta con query_office las filas por fecha del piso y horario "
                "que más se desvían (fecha, temperatura_c, reportes, minutos_sin_servicio, falla_principal, "
                "causa) y responde solo con lo que devuelva la consulta."
            ),
        ),
        Agent(
            id="report_writer",
            label="Redactor",
            description="Redacta el reporte final a partir de los hallazgos que le pases.",
            system=(
                "Eres redactor de reportes de inspección de oficina. Con los hallazgos que recibes escribe un "
                "reporte breve en español con tres secciones: Resumen, Hallazgos y Acciones recomendadas para "
                "mañana. Usa solo la información de los hallazgos del equipo; si falta algo, dilo "
                "en lugar de suponerlo."
            ),
            sees_findings=True,
            answers_for_caller=True,
        ),
    ]
    return {agent.id: agent for agent in agents}


OFFICE_INSPECTOR = Scenario(
    id="office_inspector",
    title="Inspector de oficina",
    description="Un supervisor reparte el trabajo: un agente ve la foto, otro consulta los datos y otro redacta.",
    entry="supervisor",
    build=_office_inspector,
    needs_image=True,
    examples=[
        "¿Hay algo en la oficina que deba atender antes de mañana?",
        "Revisa la foto y dime si coincide con lo que dicen los datos de la oficina de los últimos días.",
    ],
    nodes=[
        {"id": "supervisor", "kind": "agent", "label": "Supervisor", "x": 0, "y": 1},
        {"id": "vision_inspector", "kind": "agent", "label": "Inspector visual", "x": 1, "y": 0},
        {"id": "data_analyst", "kind": "agent", "label": "Analista de datos", "x": 1, "y": 1},
        {"id": "report_writer", "kind": "agent", "label": "Redactor", "x": 1, "y": 2},
        {"id": "query_office", "kind": "tool", "label": "SQL oficina", "x": 2, "y": 1},
    ],
    edges=[
        ["supervisor", "vision_inspector"],
        ["supervisor", "data_analyst"],
        ["supervisor", "report_writer"],
        ["data_analyst", "query_office"],
    ],
)

SCENARIOS: dict[str, Scenario] = {s.id: s for s in (OPS_COPILOT, OFFICE_INSPECTOR)}

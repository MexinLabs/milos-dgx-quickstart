"""GPU and host memory samples for the GPU panel (NVML)."""

from datetime import datetime, timezone

import pynvml

_nvml_ready = False


def _ensure_nvml() -> bool:
    global _nvml_ready
    if not _nvml_ready:
        try:
            pynvml.nvmlInit()
            _nvml_ready = True
        except pynvml.NVMLError:
            return False
    return True


def _read(fn, *args):
    """A metric the device does not support becomes None instead of an error."""
    try:
        return fn(*args)
    except pynvml.NVMLError:
        return None


def _host_memory() -> dict:
    fields = {}
    with open("/proc/meminfo") as f:
        for line in f:
            key, value = line.split(":", 1)
            fields[key] = int(value.split()[0])  # kB
    total = fields["MemTotal"]
    return {
        "mem_used_mb": (total - fields["MemAvailable"]) // 1024,
        "mem_total_mb": total // 1024,
    }


def sample() -> dict:
    gpus = []
    if _ensure_nvml():
        for index in range(pynvml.nvmlDeviceGetCount()):
            handle = pynvml.nvmlDeviceGetHandleByIndex(index)
            util = _read(pynvml.nvmlDeviceGetUtilizationRates, handle)
            mem = _read(pynvml.nvmlDeviceGetMemoryInfo, handle)
            power_mw = _read(pynvml.nvmlDeviceGetPowerUsage, handle)
            gpus.append(
                {
                    "index": index,
                    "name": _read(pynvml.nvmlDeviceGetName, handle),
                    "util_pct": util.gpu if util else None,
                    "mem_used_mb": mem.used // 2**20 if mem else None,
                    "mem_total_mb": mem.total // 2**20 if mem else None,
                    "temp_c": _read(pynvml.nvmlDeviceGetTemperature, handle, pynvml.NVML_TEMPERATURE_GPU),
                    "power_w": round(power_mw / 1000) if power_mw is not None else None,
                }
            )
    return {
        "ts": datetime.now(timezone.utc).isoformat(timespec="milliseconds"),
        "gpus": gpus,
        "host": _host_memory(),
    }

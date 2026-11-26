#!/usr/bin/env bash
# Preflight check for the workshop host (a DGX, or any NVIDIA GPU machine).
# Read-only: it changes nothing on the host.
#
#   ./scripts/00-preflight.sh          quick checks
#   ./scripts/00-preflight.sh --deep   also runs nvidia-smi inside a container (pulls ubuntu:24.04)
#
# MIN_FREE_GB (default 150) is the free disk space expected for images + models.

set -u

DEEP=0
[[ "${1:-}" == "--deep" ]] && DEEP=1
MIN_FREE_GB="${MIN_FREE_GB:-150}"
PORTS=(5173 8000 8888 11434)

PASS=0; WARN=0; FAIL=0
if [[ -t 1 ]]; then G=$'\e[32m'; Y=$'\e[33m'; R=$'\e[31m'; B=$'\e[1m'; N=$'\e[0m'; else G=; Y=; R=; B=; N=; fi
section() { printf '\n%s== %s ==%s\n' "$B" "$1" "$N"; }
pass() { printf '  %s[ OK ]%s %s\n' "$G" "$N" "$1"; PASS=$((PASS + 1)); }
warn() { printf '  %s[WARN]%s %s\n' "$Y" "$N" "$1"; WARN=$((WARN + 1)); }
fail() { printf '  %s[FAIL]%s %s\n' "$R" "$N" "$1"; FAIL=$((FAIL + 1)); }
info() { printf '         %s\n' "$1"; }
have() { command -v "$1" >/dev/null 2>&1; }

section "System"
if [[ -r /etc/os-release ]]; then
  pass "OS: $(. /etc/os-release && echo "$PRETTY_NAME"), kernel $(uname -r), arch $(uname -m)"
fi
if [[ -r /etc/dgx-release ]]; then
  pass "DGX OS detected"
  while IFS= read -r line; do info "$line"; done < /etc/dgx-release
else
  warn "No /etc/dgx-release: this host is not running DGX OS (fine for a laptop)"
fi
info "CPU cores: $(nproc), RAM: $(free -g | awk '/^Mem:/ {print $2}') GB"

section "NVIDIA driver"
if have nvidia-smi && nvidia-smi >/dev/null 2>&1; then
  pass "Driver $(nvidia-smi --query-gpu=driver_version --format=csv,noheader | head -1)"
  GPUS="$(nvidia-smi --query-gpu=index,name,memory.total,temperature.gpu --format=csv,noheader)"
  while IFS= read -r line; do info "GPU $line"; done <<< "$GPUS"
  if grep -q 'N/A' <<< "$GPUS"; then
    info "GPU memory is not reported: unified memory, the GPU shares the system RAM above"
  fi
else
  fail "nvidia-smi is missing or cannot talk to the driver"
fi

section "Docker"
if have docker; then
  pass "$(docker --version)"
  if docker info >/dev/null 2>&1; then
    pass "Docker daemon reachable without sudo"
    # Docker reaches the GPU either through a registered "nvidia" runtime or
    # through CDI devices (DGX OS with a recent Docker). Neither showing up here
    # is not proof of a problem: --deep runs a container, which is the real test.
    DOCKER_INFO="$(docker info 2>/dev/null)"
    if grep -qi 'runtimes:.*nvidia' <<< "$DOCKER_INFO"; then
      pass "NVIDIA runtime registered in Docker"
    elif grep -qi 'nvidia\.com/gpu' <<< "$DOCKER_INFO"; then
      pass "NVIDIA GPU exposed to Docker through CDI"
    else
      warn "Docker lists no NVIDIA runtime and no CDI GPU device; --deep tells whether containers get the GPU"
      info "If --deep fails: sudo nvidia-ctk runtime configure --runtime=docker && sudo systemctl restart docker"
    fi
    ROOT_DIR="$(docker info --format '{{.DockerRootDir}}' 2>/dev/null)"
    FREE_GB="$(df -BG --output=avail "$ROOT_DIR" 2>/dev/null | tail -1 | tr -dc '0-9')"
    if [[ -n "$FREE_GB" ]]; then
      if (( FREE_GB >= MIN_FREE_GB )); then
        pass "Disk: ${FREE_GB} GB free on Docker root ($ROOT_DIR)"
      else
        warn "Disk: ${FREE_GB} GB free on Docker root ($ROOT_DIR), expected >= ${MIN_FREE_GB} GB"
      fi
    else
      warn "Could not read free space on Docker root ($ROOT_DIR)"
    fi
  else
    fail "Cannot reach the Docker daemon as $USER (add the user to the docker group, then log in again)"
  fi
  if docker compose version >/dev/null 2>&1; then
    pass "$(docker compose version)"
  else
    fail "Docker Compose v2 plugin is missing"
  fi
else
  fail "Docker is not installed"
fi
if have nvidia-ctk; then
  pass "$(nvidia-ctk --version | head -1)"
else
  fail "NVIDIA Container Toolkit (nvidia-ctk) is not installed"
fi

section "Network"
for host in nvcr.io registry-1.docker.io registry.ollama.ai; do
  if curl -s -o /dev/null -m 6 "https://$host/v2/"; then
    pass "Reachable: $host"
  else
    warn "Not reachable: $host (images and models must already be on this host)"
  fi
done

section "Ports"
for port in "${PORTS[@]}"; do
  if ss -ltn 2>/dev/null | awk '{print $4}' | grep -qE "[:.]${port}\$"; then
    warn "Port $port is already in use (expected if the workshop stack is running)"
  else
    pass "Port $port is free"
  fi
done

if (( DEEP )); then
  section "GPU inside a container"
  if docker run --rm --gpus all ubuntu:24.04 nvidia-smi --query-gpu=name --format=csv,noheader; then
    pass "Containers can use the GPU"
  else
    fail "A container could not use the GPU"
  fi
fi

printf '\n%sSummary:%s %d ok, %d warnings, %d failures\n' "$B" "$N" "$PASS" "$WARN" "$FAIL"
(( FAIL == 0 ))

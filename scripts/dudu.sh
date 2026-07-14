#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

command_name="${1:-start}"

if ! command -v docker >/dev/null 2>&1; then
  echo "未找到 Docker。请先安装并启动 Docker Desktop。" >&2
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "未找到 Docker Compose v2。请升级 Docker Desktop 后重试。" >&2
  exit 1
fi

ensure_env() {
  if [[ ! -f .env ]]; then
    if [[ -f .env.example ]]; then
      cp .env.example .env
      echo "已由 .env.example 创建 .env 模板。AI 问书功能需要在 .env 或应用设置中填写 DeepSeek API Key。"
    else
      echo "未找到 .env.example，将使用 Docker Compose 默认配置启动。AI 问书功能可在应用左下角模型设置中配置 DeepSeek API Key。"
    fi
  fi
}

port_in_use() {
  lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1
}

pick_port() {
  local preferred="$1"
  local candidate="$preferred"
  while port_in_use "$candidate"; do
    candidate=$((candidate + 1))
  done
  printf '%s' "$candidate"
}

# Allow an explicit port when needed; otherwise safely coexist with other local services.
export DUDU_BACKEND_PORT="${DUDU_BACKEND_PORT:-$(pick_port 8000)}"
export DUDU_FRONTEND_PORT="${DUDU_FRONTEND_PORT:-$(pick_port 5173)}"

wait_for_backend() {
  printf "正在等待后端就绪"
  for _ in {1..45}; do
    if curl -fsS "http://localhost:${DUDU_BACKEND_PORT}/health" >/dev/null 2>&1; then
      echo
      return 0
    fi
    printf "."
    sleep 1
  done
  echo
  echo "服务仍在启动中。可运行 ./scripts/dudu.sh logs 查看日志。" >&2
  return 1
}

case "$command_name" in
  start)
    ensure_env
    docker compose up -d --build
    wait_for_backend
    echo "笃笃已启动："
    echo "  阅读器  http://localhost:${DUDU_FRONTEND_PORT}"
    echo "  API      http://localhost:${DUDU_BACKEND_PORT}/docs"
    ;;
  stop)
    docker compose down
    echo "笃笃已停止。本地书籍和数据库数据仍被保留。"
    ;;
  restart)
    docker compose down
    ensure_env
    docker compose up -d --build
    wait_for_backend
    echo "笃笃已重启：http://localhost:${DUDU_FRONTEND_PORT}"
    ;;
  status)
    docker compose ps
    ;;
  logs)
    docker compose logs -f --tail=120
    ;;
  *)
    echo "用法：./scripts/dudu.sh {start|stop|restart|status|logs}" >&2
    exit 2
    ;;
esac

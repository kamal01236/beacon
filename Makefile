# Beacon — local WSL deploy.
#
#   make local        bring up DB + backend + frontend + agent on a free port,
#                     print the URLs, and keep running (Ctrl-C stops all).
#   make dev          same, but `next dev` (hot reload) instead of build+start.
#   make local PORT=4000     force a port (also: BEACON_PORT in .env.local).
#   make app-only     skip the agent worker.
#   make seed         (re)load the base snapshot into Postgres.
#   make agent        run just the agent worker against an already-running app.
#   make check-secrets   verify no .env/keys are tracked or staged.
#   make hooks        install the secret check as a git pre-commit hook.
#
# Your OpenAI key goes in .env.local (gitignored), never in the repo.

.PHONY: local no-db dev app-only seed agent check-secrets hooks stop help
.DEFAULT_GOAL := help

PORT ?=
PORTFLAG := $(if $(PORT),--port $(PORT),)

local: ## Deploy DB + backend + frontend + agent (free/configurable port)
	@node scripts/local.mjs $(PORTFLAG)

no-db: ## Deploy with no Postgres (faked Jira + .data/ file store)
	@node scripts/local.mjs --no-db $(PORTFLAG)

dev: ## Same as local but with hot reload (next dev)
	@node scripts/local.mjs --dev $(PORTFLAG)

app-only: ## Deploy app + DB without the agent worker
	@node scripts/local.mjs --no-agent $(PORTFLAG)

seed: ## (Re)load /data into Postgres
	@npm run db:seed

agent: ## Run only the agent worker (app must already be up)
	@npm run agent

check-secrets: ## Fail if any .env/keys are tracked or staged
	@node scripts/check-secrets.mjs

hooks: ## Install check-secrets as a git pre-commit hook
	@mkdir -p .git/hooks
	@printf '#!/bin/sh\nnode scripts/check-secrets.mjs\n' > .git/hooks/pre-commit
	@chmod +x .git/hooks/pre-commit
	@echo "✓ pre-commit hook installed (runs check-secrets)"

stop: ## Stop the docker Postgres container (if used)
	@docker stop beacon-db 2>/dev/null || true

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

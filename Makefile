COMPOSE=docker-compose

.PHONY: build up down logs test typecheck ci-test seed

build:
	$(COMPOSE) build

up:
	$(COMPOSE) up -d db redis
	$(COMPOSE) up -d backend worker

down:
	$(COMPOSE) down

logs:
	$(COMPOSE) logs -f --tail=200 backend worker

test:
	npm run test

typecheck:
	npm run check

ci-test:
	$(COMPOSE) build backend
	$(COMPOSE) run --rm -e OPENAI_API_KEY=$${OPENAI_API_KEY:-test-key} backend sh -lc "npm run check && npm run test"



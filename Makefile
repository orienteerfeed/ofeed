ENV_FILE := .env

up:
	docker compose up -d --remove-orphans

up-build:
	docker compose up -d --build --remove-orphans

down:
	docker compose down --remove-orphans

down-with-volumes:
	docker compose down --remove-orphans --volumes

set-compose-file:
	@echo "Setting COMPOSE_FILE=$(COMPOSE_FILE_VAL)"
	@grep -v '^COMPOSE_FILE=' $(ENV_FILE) 2>/dev/null > $(ENV_FILE).tmp || true
	@echo "COMPOSE_FILE=$(COMPOSE_FILE_VAL)" >> $(ENV_FILE).tmp
	@mv $(ENV_FILE).tmp $(ENV_FILE)

use-mysql:
	$(MAKE) set-compose-file COMPOSE_FILE_VAL=compose.yaml:compose.mysql.yaml

use-minio:
	$(MAKE) set-compose-file COMPOSE_FILE_VAL=compose.yaml:compose.minio.yaml

use-traefik:
	$(MAKE) set-compose-file COMPOSE_FILE_VAL=compose.yaml:compose.traefik.yaml

use-infra-traefik:
	$(MAKE) set-compose-file COMPOSE_FILE_VAL=compose.yaml:compose.infra.yaml:compose.traefik.yaml

use-scaled:
	$(MAKE) set-compose-file COMPOSE_FILE_VAL=compose.yaml:compose.scaled.yaml

use-traefik-scaled:
	$(MAKE) set-compose-file COMPOSE_FILE_VAL=compose.yaml:compose.scaled.yaml:compose.traefik.yaml

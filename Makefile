.PHONY: help install clean build test browser-smoke check dev tailnet-serve tailnet-reset deck-build transcript pdf deploy slide-add order-init order-check order-append create presso

DECK ?= examples/basic
PORT ?= 3030
PDF_ARGS ?=
PRESSO := node packages/server/dist/cli.js

help:
	@echo "Usage: make [target]"
	@echo ""
	@echo "Core targets:"
	@echo "  make install                         Install workspace dependencies"
	@echo "  make build                           Build all packages"
	@echo "  make test                            Run test suite"
	@echo "  make browser-smoke                   Run Playwright route smoke tests"
	@echo "  make check                           Build and test"
	@echo "  make clean                           Remove local build artifacts"
	@echo ""
	@echo "Deck targets:"
	@echo "  make dev [DECK=examples/basic] [PORT=3030]"
	@echo "  make tailnet-serve [PORT=3030]"
	@echo "  make tailnet-reset"
	@echo "  make deck-build [DECK=examples/basic]"
	@echo "  make transcript [DECK=examples/basic]"
	@echo "  make pdf [DECK=examples/basic] [PDF_ARGS=\"--layout=speaker\"]"
	@echo "  make deploy [DECK=examples/basic]"
	@echo ""
	@echo "Authoring helpers:"
	@echo "  make slide-add [DECK=examples/basic]"
	@echo "  make order-init [DECK=examples/basic]"
	@echo "  make order-check [DECK=examples/basic]"
	@echo "  make order-append [DECK=examples/basic]"
	@echo "  make create NAME=my-talk"
	@echo "  make presso ARGS=\"build examples/basic\""

install:
	npm install

clean:
	rm -rf packages/*/dist packages/*/*.tsbuildinfo tsconfig.tsbuildinfo coverage .presso
	rm -rf $(DECK)/dist $(DECK)/transcript.md $(DECK)/slides.pdf $(DECK)/notes.pdf $(DECK)/notes-side.pdf $(DECK)/notes-pages.pdf

build:
	npm run build

test:
	npm run test

browser-smoke: build
	PRESSO_BROWSER_SMOKE=1 npm run test:browser

check: build test

dev: build
	$(PRESSO) dev $(DECK) --port=$(PORT)

tailnet-serve:
	tailscale serve $(PORT)

tailnet-reset:
	tailscale serve reset

deck-build: build
	$(PRESSO) build $(DECK)

transcript: build
	$(PRESSO) transcript $(DECK)

pdf: build
	$(PRESSO) pdf $(DECK) $(PDF_ARGS)

deploy: build
	$(PRESSO) deploy $(DECK)

slide-add: build
	$(PRESSO) slide add $(DECK)

order-init: build
	$(PRESSO) order init $(DECK)

order-check: build
	$(PRESSO) order check $(DECK)

order-append: build
	$(PRESSO) order append $(DECK)

create: build
	@if [ -z "$(NAME)" ]; then \
		echo "NAME must be set (example: make create NAME=my-talk)"; \
		exit 1; \
	fi
	$(PRESSO) create $(NAME)

presso: build
	$(PRESSO) $(ARGS)

.PHONY: install
install:
	npm install

.PHONY: lint
lint:
	npx textlint

.PHONY: before_commit
before_commit: lint

.PHONY: install
install:
	pip install -r requirements.txt && pre-commit install && npm install

.PHONY: lint
lint:
	npx textlint

.PHONY: before_commit
before_commit: lint

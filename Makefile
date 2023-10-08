.PHONY: install
install:
	pip install -r requirements.txt && pre-commit install && npm install

.PHONY: lint
lint:
	npx textlint ./articles/*.md

.PHONY: lint_fix
lint_fix:
	npx textlint --fix ./articles/*.md

.PHONY: before_commit
before_commit: lint

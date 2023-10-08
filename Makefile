.PHONY: install
install:
	pip install -r requirements.txt && pre-commit install && npm install

.PHONY: lint
lint:
	npm run lint

.PHONY: before_commit
before_commit: lint

.PHONY: install
install:
	pip install -r requirements.txt && pre-commit install && npm install

.PHONY: lint
lint:
	npm run lint

.PHONY: lint_fix
lint_fix:
	npm run lint:fix

.PHONY: new_article
new_article:
	npx zenn new:article --slug $(slug) --title "$(title)"

.PHONY: preview
preview:
	npm run preview

.PHONY: before_commit
before_commit: lint

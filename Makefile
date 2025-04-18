.PHONY: install
install:
	pip install -r requirements.txt && pre-commit install && pnpm install

.PHONY: lint
lint:
	pnpm run lint

.PHONY: lint_fix
lint_fix:
	pnpm run lint:fix

.PHONY: new_article
new_article:
	npx zenn new:article --slug $(slug) --title "$(title)"

.PHONY: preview
preview:
	pnpm run preview

.PHONY: before_commit
before_commit: lint

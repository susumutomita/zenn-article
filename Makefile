.PHONY: install lint lint_fix setup_husky new_article preview update-claude-secrets before_commit help

PNPM_RUN_TARGETS = lint preview

$(PNPM_RUN_TARGETS):
	pnpm run $@

.PHONY: install
install:
	pnpm install

.PHONY: lint_fix
lint_fix:
	pnpm run lint:fix

setup_husky:
	pnpm run husky

.PHONY: new_article
new_article:
	npx zenn new:article --slug $(slug) --title "$(title)"

.PHONY: update-claude-secrets
update-claude-secrets:
	./set_claude_code_secrets.sh

.PHONY: before_commit
before_commit: lint

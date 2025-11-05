_help:
    just --list

alias upgrade := update
alias lint-write := lint-fix

# Update dependencies
update:
    bunx npm-check-updates -u
    bun install

# Lints the code
lint:
	bun lint

# Lints the code (fix/write)
lint-fix:
	bun lint:fix

# Starts production
start:
	bun start

# Starts development
dev:
	bun --watch start

#!/usr/bin/env bash
# =============================================================================
# install-hooks.sh — Installs git hooks for the journal project
# Run once after cloning: bash scripts/install-hooks.sh
# =============================================================================

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
HOOKS_DIR="$REPO_ROOT/.git/hooks"
SCRIPT_DIR="$REPO_ROOT/scripts"

GREEN='\033[0;32m'; CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

echo ""
echo -e "${BOLD}${CYAN}Installing git hooks…${RESET}"

# ── pre-commit hook ────────────────────────────────────────────────────────────
cat > "$HOOKS_DIR/pre-commit" << 'HOOK'
#!/usr/bin/env bash
# Pre-commit hook: runs security pentest suite before allowing any commit.
# Installed by: bash scripts/install-hooks.sh

# Allow skipping in emergencies: PENTEST_SKIP=1 git commit -m "..."
if [[ "${PENTEST_SKIP:-0}" == "1" ]]; then
  echo -e "\033[1;33m⚠ PENTEST_SKIP=1 — security checks bypassed. USE WITH CAUTION.\033[0m"
  exit 0
fi

REPO_ROOT="$(git rev-parse --show-toplevel)"
PENTEST_SCRIPT="$REPO_ROOT/scripts/pentest.sh"

if [[ ! -f "$PENTEST_SCRIPT" ]]; then
  echo -e "\033[0;31m✗ pentest.sh not found at scripts/pentest.sh — aborting commit\033[0m"
  exit 1
fi

# Check if dev server is running
if ! curl -s -o /dev/null -w "%{http_code}" --max-time 3 "http://localhost:3000" 2>/dev/null | grep -qE "^[23]"; then
  echo ""
  echo -e "\033[1;33m⚠  Security pentest SKIPPED — dev server not running at http://localhost:3000\033[0m"
  echo -e "   To run manually: \033[0;36mbash scripts/pentest.sh\033[0m"
  echo -e "   To enforce: start the server before committing."
  echo ""
  # Don't block if server is simply not running (e.g. CI, quick fixes)
  # Change exit 0 → exit 1 if you want to enforce server-up for all commits
  exit 0
fi

echo ""
echo -e "\033[1;36m🔒 Running security pentest before commit…\033[0m"
echo ""

PENTEST_BASE_URL="http://localhost:3000" bash "$PENTEST_SCRIPT"
EXIT_CODE=$?

if [[ $EXIT_CODE -ne 0 ]]; then
  echo ""
  echo -e "\033[1;31m✗ Commit blocked by security pentest failures.\033[0m"
  echo -e "  Fix the issues above, then retry your commit."
  echo -e "  \033[2mEmergency override: PENTEST_SKIP=1 git commit -m \"...\"\033[0m"
  echo ""
  exit 1
fi

exit 0
HOOK

chmod +x "$HOOKS_DIR/pre-commit"
echo -e "  ${GREEN}✓${RESET} pre-commit hook installed"

echo ""
echo -e "${GREEN}${BOLD}Done!${RESET} Hooks installed at $HOOKS_DIR"
echo ""
echo "  The pentest suite will run automatically before each commit."
echo -e "  Run manually: ${CYAN}bash scripts/pentest.sh${RESET}"
echo -e "  Emergency bypass: ${CYAN}PENTEST_SKIP=1 git commit${RESET}"
echo ""

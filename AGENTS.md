<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:security-pentest-rules -->
# MANDATORY: Run pentest before every commit

Before committing ANY change — no matter how small — you MUST run the security pentest suite:

```bash
bash scripts/pentest.sh
```

**This is non-negotiable.** The suite tests for:
- Authentication bypass vulnerabilities
- Unprotected API routes
- OAuth open redirect attacks
- Missing security headers
- Secret/env file hygiene
- Firestore security rule regressions

**Do NOT commit if the suite reports any CRITICAL or HIGH failures.**

If the dev server is not running, start it first:
```bash
npm run dev   # in one terminal
bash scripts/pentest.sh   # in another
```

Emergency bypass (use only when the failure is unrelated to your change and you can justify it):
```bash
PENTEST_SKIP=1 git commit -m "your message"
```

The pre-commit hook (`scripts/install-hooks.sh`) enforces this automatically.
If your environment doesn't have the hook installed, run: `bash scripts/install-hooks.sh`
<!-- END:security-pentest-rules -->

# Security Policy

## Supported versions

Only the latest release on `main`, which is what is deployed to GitHub Pages, receives fixes.

## Reporting a vulnerability

Please **do not** open a public issue. Use GitHub's [private vulnerability reporting](https://github.com/seamys/ai-tech-tree/security/advisories/new) instead.

Include steps to reproduce and the impact you expect. You should get a first response within a week.

This is a static site with no backend, accounts or user data. The most relevant risks are injected content in `data/` and compromised dependencies. Both are guarded by CI validation and Dependabot.

\# Git workflow



This project uses \*\*GitHub Flow\*\*: `main` is always deployable (Render and Vercel deploy from it), and every change goes through a pull request.



\## Branches



| Prefix | Use for | Example |

|---|---|---|

| `feature/` | New features | `feature/github-repo-import` |

| `fix/` | Bug fixes | `fix/upload-size-limit` |

| `docs/` | Documentation only | `docs/setup-guide` |

| `ci/` | CI/CD and tooling | `ci/github-actions` |

| `chore/` | Cleanup, config, dependencies | `chore/update-deps` |



\## Steps



1\. Open an issue describing the change.

2\. `git checkout main \&\& git pull`

3\. `git checkout -b feature/short-name`

4\. Commit in small steps, then `git push -u origin feature/short-name`

5\. Open a pull request, fill in the template, link the issue (`Closes #12`).

6\. Merge when CI is green. Delete the branch.



\## Commit messages



Conventional Commits: `type: short description`



\- `feat: add GitHub repository import`

\- `fix: reject ZIP files over the upload limit`

\- `docs: explain local Postgres setup`

\- `test: cover password reset expiry`

\- `ci: run backend tests on pull requests`

\- `chore: bump fastapi to 0.115`



\## Releases



Tag milestones on `main` with semantic versions (`v0.1.0`, `v0.2.0`) and list changes in `CHANGELOG.md`.


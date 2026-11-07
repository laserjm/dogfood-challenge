# Non AI Coding Challenge

```bash
git switch -c stage-2        # branches from the commit that has cp-1
# … work, commit …
git tag -a cp-2 -m "Stage 2 done"     # on the branch's last commit, after self-check
# review: git diff cp-1..cp-2, then fix
git switch main
git merge --no-ff stage-2    # or --ff-only

```

# Hackathon checklist

## Hour 0-2: decide
- [ ] Hear theme, read judging criteria, note sponsor prizes/API credits
- [ ] Pick ONE idea; write pitch + 3 must-have features in SPEC.md
- [ ] Pick stack; fill CLAUDE.md Stack and Commands; log in DECISIONS.md
- [ ] Split work (who owns which files) to avoid merge conflicts

## Hour 2-6: thin slice
- [ ] Scaffold; one feature working end to end, even if ugly
- [ ] Deploy it (live URL) before building more
- [ ] Commit and push at least hourly

## Middle: build
- [ ] Features in SPEC.md order; hardcode/fake anything judges won't test
- [ ] Short branches; `git pull --rebase` before every push
- [ ] Update PROGRESS.md

## Last 3 hours: freeze
- [ ] No new features; fix bugs only
- [ ] Record 2-3 min backup demo video
- [ ] Seed demo data/account; test live URL on a phone
- [ ] Devpost: title, description, screenshots, video, repo link, tech list

## Demo script (2-5 min)
1. Problem (1 sentence)  2. Live demo of core flow  3. How it works (1 slide/diagram)  4. What's next

## Daily git routine
```
git pull --rebase
# work, then
git add -A && git commit -m "what changed"
git pull --rebase && git push
```

## Bring
Charger, hotspot backup, water, snacks.

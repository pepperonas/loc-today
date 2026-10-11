<div align="center">

<a href="https://github.com/pepperonas/loc-today"><img src="docs/social.png" alt="loc-today — every line Claude wrote today, across all sessions, and which project it went to" width="100%"></a>

# 📈 loc-today

**A Claude Code mod that shows, right under the prompt, how many lines of code Claude created, edited and deleted today — summed over every session you have open, not just this one. Hover the line and it opens a ranking of your projects, largest first.**

<p>
  <a href="#-install"><img alt="Install in 10 seconds" height="56" src="https://img.shields.io/badge/%E2%AC%87%EF%B8%8F_Install-in_10_seconds-2E9E5B?style=for-the-badge"></a>
  &nbsp;
  <a href="#-demo"><img alt="See it move" height="56" src="https://img.shields.io/badge/%F0%9F%8E%AC_Demo-see_it_move-7B4DFF?style=for-the-badge"></a>
</p>

<h3>👉 <code>/plugin marketplace add pepperonas/loc-today</code> · <code>/plugin install loc-today@pepperonas-loc-today</code> — that's it.</h3>

[![version](https://img.shields.io/badge/version-0.1.0-7B4DFF?style=for-the-badge&logo=anthropic&logoColor=white)](CHANGELOG.md)
[![node tests](https://img.shields.io/badge/node%20tests-43-2E9E5B?style=for-the-badge&logo=nodedotjs&logoColor=white)](tests)
[![engine tests](https://img.shields.io/badge/engine%20tests-11-2E9E5B?style=for-the-badge&logo=anthropic&logoColor=white)](hooks)
[![lines of code](https://img.shields.io/badge/lines%20of%20code-0.6k-4B6BDF?style=for-the-badge&logo=typescript&logoColor=white)](hooks)

[![CI](https://img.shields.io/github/actions/workflow/status/pepperonas/loc-today/ci.yml?branch=main&label=CI&logo=github)](https://github.com/pepperonas/loc-today/actions/workflows/ci.yml)
[![Claude Code mod](https://img.shields.io/badge/Claude%20Code-mod-D97757?logo=anthropic&logoColor=white)](https://code.claude.com/docs/en/plugins/mods/overview)
[![tested with](https://img.shields.io/badge/tested%20with-Claude%20Code%202.1.296-D97757?logo=anthropic&logoColor=white)](#requirements)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Node](https://img.shields.io/badge/Node-%E2%89%A520-339933?logo=nodedotjs&logoColor=white)](package.json)
[![runtime deps](https://img.shields.io/badge/runtime%20dependencies-0-2E9E5B?logo=npm&logoColor=white)](package.json)
[![scope](https://img.shields.io/badge/scope-all%20sessions-8A63FF?logo=windowsterminal&logoColor=white)](#-how-it-works)
[![network calls](https://img.shields.io/badge/network%20calls-none-2E9E5B?logo=letsencrypt&logoColor=white)](#-privacy)
[![mutation tested](https://img.shields.io/badge/mutation-tested-FF6F00?logo=testinglibrary&logoColor=white)](#-testing)
[![Keep a Changelog](https://img.shields.io/badge/changelog-Keep%20a%20Changelog-E05735?logo=keepachangelog&logoColor=white)](CHANGELOG.md)
[![SemVer](https://img.shields.io/badge/SemVer-0.x-3F4551?logo=semver&logoColor=white)](https://semver.org)
[![last commit](https://img.shields.io/github/last-commit/pepperonas/loc-today?logo=git&logoColor=white)](https://github.com/pepperonas/loc-today/commits/main)
[![open issues](https://img.shields.io/github/issues/pepperonas/loc-today?logo=github)](https://github.com/pepperonas/loc-today/issues)
[![repo size](https://img.shields.io/github/repo-size/pepperonas/loc-today?logo=github)](https://github.com/pepperonas/loc-today)
[![stars](https://img.shields.io/github/stars/pepperonas/loc-today?logo=github)](https://github.com/pepperonas/loc-today/stargazers)
[![forks](https://img.shields.io/github/forks/pepperonas/loc-today?logo=github)](https://github.com/pepperonas/loc-today/forks)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen?logo=github)](#-contributing)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

[![Donate with PayPal](https://img.shields.io/badge/PayPal-support%20this%20project-00457C?style=for-the-badge&logo=paypal&logoColor=white)](https://www.paypal.com/donate/?business=martin.pfeffer@celox.io&currency_code=EUR&item_name=loc-today)
[![Rate celox.io on Google](https://img.shields.io/badge/Google-rate%20celox.io-4285F4?style=for-the-badge&logo=google&logoColor=white)](https://g.page/r/CXgdRV3QysvxEBM/review)

</div>

---

> [!NOTE]
> **Counted from Claude Code's own diffs.** An Edit or Write result carries the exact patch Claude Code
> applied; loc-today counts its `+` and `-` lines. Nothing is estimated from token counts, nothing
> leaves your machine.

## 🎬 Demo

<img src="docs/demo.gif" alt="Three sessions work through the day: the line under the prompt counts up new, edited and deleted lines and the number of projects; then the pointer rests on it and the ranking of projects opens." width="100%">

<sub>Three sessions working at once — the line counts every one of them. Rest the pointer on it and the ranking opens: largest project first, with a bar, new / edited / deleted lines, files touched and its share of the day.</sub>

## 📸 Screenshots

<img src="docs/hero.png" alt="The line under the prompt reads: today +738 new, ~88 edited, −224 deleted, 5 projects. Below it the hover card ranks shop, api, blog, infra and dotfiles." width="100%">

<sub>Hovered: the day split by project, largest first.</sub>

<img src="docs/states.png" alt="Three states: no lines changed yet; a busy day; a narrow terminal with numbers only." width="100%">

<sub>First thing in the morning, a busy day, and a narrow terminal (below 80 columns the words go, the numbers stay).</sub>

## ✨ Features

- **Global, not per session** — every session writes its own figures for the day, and every line under every prompt shows the sum of all of them. Start a session in another project and it shows up within five seconds.
- **New, edited, deleted** — a removed line that is replaced by a new one is one **edited** line, not one deleted and one new one; what is left over is new or deleted. So renaming a variable on 3 lines is `~3`, not `+3 −3`.
- **Per project, ranked** — hover the line: the projects of the day, largest first, with a bar, the three counts, the files touched and the share of the day. Ten projects are listed, the rest summed in one line.
- **Projects found by git** — a file belongs to the git work tree it is in, wherever the session was started. Outside git, to the session's folder. Two projects with the same folder name are told apart by their parent.
- **Shell commands too** — `rm`, `sed -i`, `mv`, code generators: a Bash command is measured by the work tree before and after it (see [How it works](#-how-it-works)).
- **Only what really happened** — a failed or refused call counts nothing; a Write that only re-saved the same content counts nothing.
- **A new day at local midnight**, the last seven days kept, older ones cleaned up.

## 📥 Install

### Requirements

- **Claude Code with mods** — mods are on by default in current releases; loc-today is tested with **2.1.296**.
- **git** on your `PATH` (for finding projects and measuring shell commands). Nothing else: no account, no token, no network.
- The hover card needs a terminal that reports the mouse to Claude Code. The line itself and `/loc-today` work everywhere.

### Option 1 — marketplace (recommended)

The repository is its own plugin marketplace. In Claude Code:

```
/plugin marketplace add pepperonas/loc-today
/plugin install loc-today@pepperonas-loc-today
```

or from the shell:

```bash
claude plugin marketplace add pepperonas/loc-today
claude plugin install loc-today@pepperonas-loc-today
```

Counting starts with the next tool call of any session that has it loaded. Update with `/plugin marketplace update pepperonas-loc-today`, then `claude plugin update loc-today@pepperonas-loc-today`. Settings: `/plugin configure loc-today@pepperonas-loc-today` (every option has a default, so you can skip it).

### Option 2 — skills folder

Claude Code loads a plugin it finds in `~/.claude/skills/<name>` by itself, in every session:

```bash
git clone https://github.com/pepperonas/loc-today ~/.claude/skills/loc-today
```

Update with `git -C ~/.claude/skills/loc-today pull`. If you also install it from the marketplace, the marketplace copy wins.

### Option 3 — one session

```bash
git clone https://github.com/pepperonas/loc-today
claude --plugin-dir ./loc-today
```

### Option 4 — desktop app and SDK hosts

Where you can't pass a flag, name the folder in `CLAUDE_CODE_PLUGIN_DIRS` — in your shell environment or in the `env` block of `~/.claude/settings.json`:

```json
{ "env": { "CLAUDE_CODE_PLUGIN_DIRS": "~/src/loc-today" } }
```

## 🕹️ Usage

Nothing to do: the line appears under the prompt and counts as Claude works. The command shows the details and tunes it:

| Command | What it does |
| --- | --- |
| `/loc-today` | Today's totals and the full ranking of projects |
| `/loc-today full` | The whole line: numbers with words and the project count (default) |
| `/loc-today compact` | Numbers only |
| `/loc-today off` | No line; counting goes on, `/loc-today` still reports |
| `/loc-today reset` | Forget what **this** session counted today |
| `/loc-today reset all` | Forget what **every** session counted today |

The display setting is remembered across sessions.

## ⚙️ Configuration

`/plugin configure loc-today@pepperonas-loc-today` sets the default; the command above overrides it.

| Option | What it does | Default |
| --- | --- | --- |
| `mode` | `full`: the whole line · `compact`: numbers only · `off`: hidden | `full` |

## 🧠 How it works

**Where the numbers come from.** loc-today hooks `tool.call`, lets the tool run, and reads the result:

- **Edit / Write** — Claude Code hands back the `structuredPatch` it applied. Within each run of changed lines between context lines, removed and added lines are paired: `edited = min(−, +)`, the rest is `new` or `deleted`. A new file that comes without a patch counts its content as new lines.
- **Bash** — Claude Code does not hand a shell command's diff to mods (verified on 2.1.296: the field exists but stays empty). So loc-today measures it from outside: in the git work tree the session runs in, it records `git diff --numstat HEAD` and the untracked files **before** the command and again **after** it, and counts the difference. A file that disappears counts all its lines as deleted; a new untracked file counts its lines as new. Files an Edit or Write already counted while the command ran are skipped, so nothing is counted twice. A command that moves `HEAD` (a commit, checkout or reset) is not measured — what changed and what was merely committed can't be told apart then.

The git commands it runs, all read-only and without optional locks (`GIT_OPTIONAL_LOCKS=0`):

<!-- git-commands -->
```
git rev-parse --show-toplevel                 which project a file, and the session, belong to
git rev-parse HEAD                            before and after a Bash command: did HEAD move?
git diff --numstat --no-renames HEAD          before and after a Bash command: lines per tracked file
git ls-files --others --exclude-standard      before and after a Bash command: new untracked files
```
<!-- /git-commands -->

**How it is global.** Each session keeps its figures under its own key in the plugin's store, which every session of your account shares: `day:<date>:<session id>` → projects with created / edited / deleted lines and the files touched. A session writes **only its own key**, so two sessions writing at the same moment can never overwrite each other. Every five seconds (and right after its own changes) a session reads all of today's keys and sums them. The date is your local date (`date +%z`, read again every ten minutes, so it follows daylight saving). Keys older than seven days are removed when a session starts.

**What is drawn.** The line and the card are plain styled segments from `hooks/row.ts` under Claude Code's own prompt hint. The card is a Box that is hidden until the pointer is over the line — no hook runs on hover, nothing is fetched.

## 🔒 Privacy

- **No network.** The mod makes no request of any kind.
- **Stores counts and file paths only** — never file contents. The paths stay in Claude Code's local plugin store and are used to count distinct files.
- **Reads what it must:** the results of tool calls, the line count of new untracked files after a shell command, and the `git` output above.
- **Never in the way:** every hook falls back to the plain tool call on any error.

## 🧪 Testing

There are two suites, and the split is deliberate.

**Node suite** — `tests/*.spec.ts`, plain `node:test`, no Claude Code needed; this is what CI runs. It covers the counting rule (pure additions, pure removals, pairing within a run, runs split by context, several hunks, `\ No newline`), new files without a patch, overwrites, odd results, the numstat parser and the before/after delta (pre-existing uncommitted work not counted again, reverted lines counted as removed, a moved `HEAD` not measured, files another tool counted skipped), the local day across midnight and offsets, cleanup of old days, recording and summing two sessions without counting twice, ranking and ties, same-named folders, store values that don't fit, the line, the card (top ten + rest) and the report. Plus **drift guards** that hold this README to the code: the version everywhere, the test-count badges, every `/config` field and its default, every command, the git command list, every image, the marketplace entry and the install commands.

**Engine suite** — `hooks/*.test.tsx`, run by `claude plugin test .` against Claude Code's own engine: Edit, Write and Bash summed under the prompt with the engine's hint kept; the card ranks projects with their shares; another session's figures for today count and yesterday's don't, and this session writes only its own key; figures written later by another session appear on the next poll; a failed call counts nothing; narrow terminals; `off`, `full`, `reset` and `reset all`; old days cleaned up; Bash measured from the work tree; a Bash command that moves `HEAD` not measured.

**Every guarded behaviour is mutated once** — the bug put back, and the suite must go red. A test that has never been seen red is not an assurance.

It was also **verified live** on Claude Code 2.1.296: two sessions side by side, one writing a 5-line file and the other a 3-line file — both lines read `+8`; an edit showed `~1` in both; `rm` of a 6-line file and a new 2-line file in a git repository showed `−6` and `+2`; a simulated mouse move over the line opened the ranked card; a failed Edit counted nothing.

```bash
npm install              # dev tools only; the mod itself has no dependencies
npm test                 # node suite (CI)
claude plugin test .     # engine suite
claude plugin validate . # what the module hooks and calls
npm run screenshots      # re-render docs/ (needs `npx playwright install chromium` and ffmpeg)
```

## ❓ FAQ

**The numbers look low.** Only sessions that have loc-today loaded count, and only from the moment it was installed — the work before that today isn't in Claude Code's results any more. Shell commands are measured in the git work tree the session runs in; a command that changes files outside it, or outside git, isn't counted.

**Does it count what I type myself?** No — only what Claude changes through its tools. Your own edits in the editor are not tool calls.

**A Bash command ran while another session edited the same repository.** Then that session's edit can show up in this command's before/after difference too. It's rare, and it's the price of measuring shell commands from outside.

**Subagents?** Not verified yet. If Claude Code runs a subagent's tool calls through the mod's hooks, they are counted like any other; if not, they are missing. An issue with what you see is welcome.

**How do I start over?** `/loc-today reset` forgets this session's figures for today, `/loc-today reset all` everyone's. Other days are kept.

## 📝 Changelog

The full history is in [CHANGELOG.md](CHANGELOG.md) ([Keep a Changelog](https://keepachangelog.com/en/1.1.0/)).

- **0.1.0** — today's new, edited and deleted lines under the prompt, summed over all sessions, the ranked project card on hover, shell commands measured by git, `/loc-today`.

## 🤝 Contributing

Issues and pull requests are welcome. Please keep both suites green (`npm test`, `claude plugin test .`) and put the bug back once before you trust a new test. A change to a command, a setting, a git command or the version usually needs its counterpart in this README in the same PR — the drift guards will point at it.

## 💛 Support

loc-today is free and stays that way. If you like seeing the day add up:

- ⭐ **Star the repo** — it helps others find it.
- 💶 **[Donate with PayPal](https://www.paypal.com/donate/?business=martin.pfeffer@celox.io&currency_code=EUR&item_name=loc-today)** — keeps it maintained.
- 📝 **[Rate celox.io on Google](https://g.page/r/CXgdRV3QysvxEBM/review)** — helps just as much.

## 📄 License

MIT © 2026 **Martin Pfeffer** · [celox.io](https://celox.io). See [LICENSE](LICENSE).

loc-today is an independent community project and is not affiliated with or endorsed by Anthropic. *Claude* and *Claude Code* are trademarks of Anthropic, PBC.

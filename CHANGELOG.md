# Changelog

All notable changes to loc-today are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-10-11

### Added

- A line under the prompt with today's new, edited and deleted lines of code, summed over every
  session that has the mod loaded.
- On hover, the day by project, largest first: bar, counts, files touched, share; ten listed, the rest summed.
- Edit and Write counted from the patch Claude Code reports; replaced lines count as edited.
- Bash commands measured by the git work tree before and after (`git diff --numstat HEAD`, new
  untracked files); a command that moves HEAD is not measured.
- Each session writes only its own store key per day; old days are cleaned up after seven days.
- `/loc-today [full|compact|off|reset|reset all]`; `userConfig` `mode`.

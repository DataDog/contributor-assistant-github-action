# Changelog

All notable changes to this project will be documented in this file.

This repository is [DataDog/contributor-assistant-github-action](https://github.com/DataDog/contributor-assistant-github-action), a fork of
[contributor-assistant/github-action](https://github.com/contributor-assistant/github-action), which was archived by its original authors after
version 2.6.1. The fork is owned and maintained by the DataDog Open Source Program Office
([@DataDog/open-source-program-office](https://github.com/orgs/DataDog/teams/open-source-program-office)).
Entries from 2.6.1 and earlier were published by the original authors; every entry in the Unreleased section
and beyond is maintained by DataDog in this fork.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `CODEOWNERS` assigning ownership of the whole codebase to the DataDog OSPO team.
- This changelog.
- Test suites covering the workflow-id resolution and the removed legacy lookup
  algorithm, plus a repaired legacy test suite (the original suites no longer
  compiled against the current source tree).

### Changed

- The action now runs on Node 24 (previously Node 20).
- CI builds and runs the test suite on Node 20 and Node 24 (previously it only
  built on Node 18 and Node 20 and never ran tests).
- CI workflow triggers follow the default-branch rename from `master` to
  `main`.
- Documentation and repository metadata (`README.md`, `package.json`,
  `CONTRIBUTING.md`) now point at this fork instead of the archived upstream
  repository.

### Fixed

- Intermittent `Unable to locate this workflow's ID in this repository, can't
  trigger job..` failures on repositories with many workflows: the workflow id
  is now resolved from the current workflow run instead of paginating the
  repository's workflow list, which intermittently returned pages in
  inconsistent order, skipping and duplicating workflows. The lookup performs
  no workflow enumeration and has no enumeration fallback; failures are
  explicit.

### Removed

- The `assign-to-project` CI workflow: it assigned new issues to the upstream
  repository's retired GitHub classic Projects board and could only fail.
- The `add-contributors-in-readme` CI workflow and the auto-generated
  contributors picture table in the README.

## [2.6.1] - 2024-09-26

Last version published by the original authors of `contributor-assistant/github-action`.

### Changed

- Move bot signature outside of recheck text
  ([upstream PR #163](https://github.com/contributor-assistant/github-action/pull/163)).

For changes prior to 2.6.1, see the original project's
[releases page](https://github.com/contributor-assistant/github-action/releases).

[Unreleased]: https://github.com/DataDog/contributor-assistant-github-action/compare/v2.6.1...HEAD
[2.6.1]: https://github.com/contributor-assistant/github-action/releases/tag/v2.6.1

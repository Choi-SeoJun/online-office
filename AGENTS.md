# Project workflow

- The user wants ongoing work managed in GitHub: `https://github.com/Choi-SeoJun/online-office`.
- Fetch `github/main` before changes and inspect local changes before switching branches. Preserve user work and never force-push without explicit instruction.
- Implement and verify changes on a focused branch, commit them and update GitHub as part of completing an authorized task. Keep `main` as the current working product unless the user requests a pull-request-only workflow.
- The existing Site is the public, anonymous-play deployment, explicitly requested by the user. Use the shared/public Sites publish flow, not the owner-private shortcut. Preserve its project ID and audience, and use the supported Sites source/build/publication workflow when updating the playable site. Synchronize the same source commit to GitHub and the hosting source.
- Keep credentials, generated builds, dependencies and local runtime files out of Git. Preserve the Korean UI, existing solo play, and the user-authorized invite-based multiplayer mode (up to 16 participants with text chat).

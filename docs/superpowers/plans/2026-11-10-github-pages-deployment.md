# GitHub Pages deployment implementation plan

Goal: publish the same solo and multiplayer game at https://choi-seojun.github.io/online-office/ while preserving the current anonymous Sites backend.

Authorization: user selected free deployment and explicitly approved making the repository, source and history public. Keep its existing name and account. Preserve all game behavior and the existing Sites URL.

Architecture: a separate Vite React client build serves the existing OfficeEntry under /online-office/. A narrow cross-origin API policy admits only https://choi-seojun.github.io in addition to same-origin traffic. The existing Worker and D1 stay on Sites. GitHub Actions builds and publishes only static assets. Private browser data stays local; provide manual Todo export/import for changing origins.

1. Add a standalone static entry/build and runtime URL helpers, retain Sites defaults, use repository-relative assets, and remove the active entry's Next-only dynamic import.
2. Add and test exact-origin CORS/preflight handling in the room API without weakening session validation, request limits or same-origin protections.
3. Add local Todo export/import with validation, additive merge and no server transmission.
4. Verify typecheck, complete test suite, both production builds and browser solo/multi flows. Inspect tracked source/history before public release.
5. Synchronize the exact source to GitHub and Sites, deploy backend changes, publish the approved public repository and enable workflow-based GitHub Pages.
6. Follow the Actions run to completion, verify the public URL, MP3 asset paths and two-client multiplayer, then update repository homepage. Keep main current.

Review focus: /online-office/ asset paths; arbitrary origins rejected; cross-origin errors readable; reload/invite URLs; existing tasks preserved during import and unchanged old-site storage.

# Sources

Every page this project has fetched, and what it was used for. `P` primary/official
carries the design, `S` secondary is context, `L` lead-only is a hint and never proof.

| URL | Type | Title | Retrieved | Used for |
|---|---|---|---|---|
| https://raw.githubusercontent.com/microsoft/playwright/v1.63.0/packages/playwright-core/src/server/electron/electron.ts | P | electron-ts | 2026-10-04 | U-1: what _electron.launch passes (--inspect=0, --remote-debugging-port=0) and which stderr lines it waits for, in order |
| https://playwright.dev/docs/api/class-electron | P | Electron \| Playwright | 2026-10-04 | U-1, U-3: the official _electron.launch API, its options and its support statement |
| https://playwright.dev/docs/api/class-electronapplication | P | ElectronApplication \| Playwright | 2026-10-04 | U-3: what an ElectronApplication gives (evaluate in main, firstWindow, close, process) |
| https://raw.githubusercontent.com/microsoft/playwright/v1.63.0/docs/src/api/class-browsertype.md | P | class-browsertype-md | 2026-10-04 | U-3: chromium.connectOverCDP at v1.63.0, its fidelity note and what it returns |
| https://www.electronjs.org/docs/latest/tutorial/fuses | P | Electron Fuses \| Electron | 2026-10-04 | U-2, U-4: what the nodeCliInspect fuse disables, and the full fuse list (no remote-debugging fuse) |
| https://www.electronjs.org/docs/latest/api/command-line-switches | P | Supported Command Line Switches \| Electron | 2026-10-04 | U-2, U-4: --remote-debugging-port as an Electron/Chromium switch, separate from the Node --inspect flags |
| https://www.electronjs.org/docs/latest/tutorial/automated-testing | P | Automated Testing \| Electron | 2026-10-04 | U-3, U-4: Electron's own testing guidance (Playwright, WebdriverIO, Selenium/ChromeDriver) |
| https://www.electronjs.org/docs/latest/tutorial/security | P | Security \| Electron | 2026-10-04 | U-4: Electron security guidance on debugging surfaces in a shipped build |

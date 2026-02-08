# Railway Uploader (Desktop Helper)

A lightweight Electron-based UI to push local files to your Railway app without touching the CLI.

## Features

- Drag-and-drop or browse for `.js`, `.css`, `.html`, and `.sql` files.
- SQL uploads reuse the existing `scripts/upload-sql-to-railway.js` helper.
- Code files are copied (if needed), committed, and pushed to `origin/main` automatically.
- Real-time progress log and persistent history (stored in Electron user data).

## Prerequisites

- Git installed and configured with access to your GitHub repo.
- Railway CLI installed and authenticated (`railway login`).
- `node`, `npm`, and `psql` available on your PATH.

## Getting started

```bash
cd tools/railway-uploader
npm install
npm run start
```

The renderer provides inputs for the Railway service name (required for SQL uploads) and the commit message (used for JS/CSS/HTML pushes).

### Notes

- Files dropped from outside the repository are copied into `uploads/from-ui/` before being committed.
- Make sure your working tree is clean before running the uploader; otherwise Git may include unrelated changes.
- History is capped at the 50 most recent upload sessions and stored via `electron-store` under the default Electron user data directory.
- The UI enforces providing a commit message for code uploads and a Railway service name for SQL uploads so CLI commands don't fail mid-run.

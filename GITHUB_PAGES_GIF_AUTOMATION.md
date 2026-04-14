# GitHub Pages GIF Automation

## What this adds

This project can now pre-generate GIFs and publish stable GIF links for GitHub Pages.

- GIF files are generated into `public/GIF`.
- CSV references can be rewritten to your GitHub Pages URL.
- A GitHub Actions workflow can auto-commit generated GIF assets.

## Local command

Run this to generate Pages-ready assets locally:

```bash
npm run gif:convert:pages
```

Output:

- Generated CSV: `Book 2 - GIF Ready.generated.csv`
- GIF files: `public/GIF/*`

## CI workflow

Workflow file:

- `.github/workflows/generate-gif-assets.yml`

Triggers:

- Manual run (`workflow_dispatch`)
- Push to `main` when:
  - `Book 2 - GIF Ready.csv` changes
  - `scripts/ezgif-from-csv.mjs` changes
  - workflow file changes

Behavior:

1. Runs GIF conversion.
2. Writes GIF files to `public/GIF`.
3. Rewrites CSV links to absolute GitHub Pages URLs.
4. Commits updated generated CSV and GIF assets when there are changes.

## Script options for Pages mode

Example:

```bash
node scripts/ezgif-from-csv.mjs \
  --input "Book 2 - GIF Ready.csv" \
  --output-csv "Book 2 - GIF Ready.generated.csv" \
  --output-dir "public/GIF" \
  --csv-link-mode "public-base" \
  --public-base-url "https://rubioo0.github.io/gym_tracker/" \
  --public-gif-prefix "GIF"
```

## Important note

On static GitHub Pages hosting, runtime MP4->GIF conversion requires a backend proxy and is disabled when no proxy is configured.
Use pre-generated GIF links for production reliability.

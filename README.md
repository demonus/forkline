# Forkline

Standalone savings scenario planner by [Gummy Labs](https://www.gummylabs.app/). Plans live in browser `localStorage` and can be downloaded / opened as `.forkline.json` files. No backend.

## Run

```bash
npm install
npm run dev
```

Open http://localhost:5180

In the app: **Planner**, **How to**, and **About**.

## Features

- Plans, accounts, cashflows, value outlooks
- Scenario branches (override / suppress / merge)
- Monthly projection, timeline charts, account journal
- Autosave to local storage
- Download / open JSON plan files
- In-app About and How to guides

## Notes

Schema version is currently `1` (`forkline.document.v1` in local storage).

Plan files (`.forkline.json`) are interchangeable with Stermione’s Savings Planner **Download JSON** / **Open plan…** controls when you use both tools.

# Poker Night

A mobile-first progressive web app for running house poker nights. Track buy-ins and rebuys, cash players out, and let the app figure out who pays whom at the end of the night.

Built as a PWA (zero build step, no backend). Data lives in your browser's `localStorage`. Works offline once loaded. Drop it on GitHub Pages and it's a one-tap-install app on your phone's home screen.

## Features

- **Create a game** with name, date, location, buy-in amount and chip value.
- **Invite players** via a shareable link that opens a WhatsApp message prefilled with game details.
- **Live buy-ins and rebuys** — tap a player, type an amount, done.
- **Cash-outs** — enter a chip count, the app computes the cash value and net position.
- **Float tracker** — always know how much cash the host should have in hand.
- **Automatic settlement** — minimum-transaction algorithm. App tells you "Alex pays Jordan £20" and so on.
- **Game history + per-player P&L** — every finished game is stored locally with net positions.
- **Leaderboard** — ranked by lifetime P&L across all games, with games played, win rate and biggest win.
- **Dark-first UI** — designed for dim poker rooms.
- **Offline** — service worker caches the shell so it works with no signal at the venue.
- **Install to home screen** — standard PWA install from Safari/Chrome.

## What's not in this build

Everything marked "Won't" in the BRD, plus:
- Real WhatsApp OTP authentication — onboarding is a simple name + phone stub (no server).
- Cross-device sync — data is local to the browser. Export/import JSON is available in Profile → Data.
- Native push notifications, universal/app-link deep linking, PDF export.

These are the pieces that need a backend. The UX and the on-device logic are all here.

## Running it locally

Any static file server works. For example:

```bash
python3 -m http.server 8080
# then open http://localhost:8080
```

Or with Node:

```bash
npx serve .
```

Service workers require HTTPS or `localhost`, so don't just double-click `index.html` — serve it.

## Hosting on GitHub Pages

1. Push this repo to GitHub (see below).
2. In the repo's **Settings → Pages**, set the source to **Deploy from a branch**, branch `main`, folder `/ (root)`.
3. GitHub will publish it at `https://<your-username>.github.io/<repo-name>/` within a minute.
4. Open that URL on your phone and add it to your home screen.

The `.nojekyll` file is already included so GitHub Pages won't try to treat it as a Jekyll site.

## Project structure

```
poker-night/
├── index.html               # app shell + tab bar
├── styles.css               # dark-first, mobile-first styles
├── app.js                   # all application logic (state, routing, views, settlement)
├── manifest.webmanifest     # PWA manifest
├── sw.js                    # service worker (offline caching)
├── icon.svg                 # app icon
├── .nojekyll                # GitHub Pages: skip Jekyll
├── .gitignore
└── README.md
```

No build step, no dependencies.

## Settlement algorithm

The end-of-night settlement uses a greedy minimum-transaction algorithm:

1. Compute each player's net position (cash-out − buy-in).
2. Sort creditors (net > 0) and debtors (net < 0).
3. Repeatedly pair the biggest creditor with the biggest debtor and transfer `min(|debt|, credit)` between them, until both are zero.

This produces a transaction list with at most `n − 1` entries for `n` players and in practice far fewer.

## Data model

Stored in `localStorage` under `pokerNight.v1`:

```ts
state = {
  me: { id, name, phone, avatar },
  users: { [id]: { id, name, phone, avatar } },
  games: {
    [id]: {
      id, name, date, location,
      buyIn, chipValue, startingFloat,
      hostId, status: 'draft' | 'active' | 'ended',
      createdAt, startedAt, endedAt,
      players: { [userId]: { userId, buyIns:[...], cashOuts:[...], status } },
      playerOrder: [userId],
      settlement: { tx: [{ from, to, amount, paid }], generatedAt },
      inviteToken,
    }
  },
  currency: '£',
}
```

## License

MIT. Built from a BRD; see the BRD for product intent.

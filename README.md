# Harbourline

[![make.fun · best-game-01](https://make.fun/badge/best-game-01.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![rank](https://make.fun/badge/best-game-01/vishnuvardankumar/harbourline/rank.svg)](https://make.fun/bounty/best-game-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![reward](https://make.fun/badge/best-game-01/vishnuvardankumar/harbourline/reward.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)

Harbourline is an original round-based tactical first-person shooter, built for make.fun's ["Make the best game" bounty](https://make.fun/bounty/best-game-01). Two teams fight over a dusk harbour yard: eliminate the other team or plant and defend the bomb. Rounds, money, a buy menu, four weapons, a grenade, and bots on both sides.

## Play it

Serve `game/` with any static file server and open `game/index.html` in a desktop browser:

```sh
npx serve game
```

Or use the included server (Node 22):

```sh
node serve.ts
```

Keyboard and mouse. No network requests, no build step — the game runs from its own static files, with three.js 0.187.0 vendored under `game/vendor/three/`.

## How it is built

- `game/` — the playable game: `index.html`, `src/` (input, player, world, weapons, bots, grenades, HUD) and vendored three.js.
- `main.ts` — the entry program: copies `game/` and `screenshots/` to the output and writes `dossier.json` with `vendor/makefun-game.ts`.
- `screenshots/` — three real renders of the game (start, play, end).

## Referral

Try make.fun with my link: https://make.fun/r/za7y6zeb

## License

MIT — see [LICENSE](LICENSE).

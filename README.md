# V-Strike

V-Strike is a browser-based, Valorant-inspired FPS prototype built with Babylon.js and Node.js. This repository contains the project source and development notes so contributors can study and continue the implementation.

## Project status

This is an archived community handoff. The prototype includes a browser game client, a Node.js multiplayer server, weapon and match systems, map streaming, mobile controls, and agent ability code. The game is not a complete or official Valorant client. Some systems are experimental and have not been verified across all browsers or devices.

The web build previously used two maps (Abyss and Haven), three implemented agents (Clove, Jett, and Sage), and a collection of weapon models. Those game models, textures, animations, maps, and other extracted game assets are intentionally not distributed in this source repository. Add only assets that you created or are licensed to redistribute, and adapt the manifests to match them.

## Repository layout

- `val-strike-html/` — browser client, screens, CSS, game code, configuration, and server-side static host helpers.
- `server/` — Node.js multiplayer service and room/game simulation.
- `tools/` — source utilities and development scripts. Generated exports and downloaded references are excluded.
- `*.md` — implementation, research, and development notes written during the prototype.

## Requirements

- Python 3 for the local web server and selected asset utilities.
- Node.js for the multiplayer server and JavaScript tools.
- A browser with WebGL 2 support for the Babylon.js client.

The exact commands and ports depend on the selected development script. Inspect `DEVELOPMENT.md` and `MULTIPLAYER-IMPLEMENTATION.md` before starting the client and server. Do not expose the development server to the public internet without adding authentication, rate limits, and deployment hardening.

## Assets and legal status

This repository does not grant rights to Valorant, Riot Games, or any third-party material. Names, characters, game content, and any assets obtained from game installations or game data remain the property of their respective owners. This project is an unofficial fan-made prototype and is not affiliated with or endorsed by Riot Games.

Do not commit extracted game models, textures, animations, sounds, map geometry, UI artwork, or generated packages containing those materials. Contributors should supply original or properly licensed replacements locally; keep private or unredistributable files out of commits. Consult the upstream rights holder's current policies before publishing any game-related media or assets.

Because the prototype depends on local game assets that are not included here, a fresh checkout will need lawful replacement assets before all screens and matches can render as originally shown. The manifests under `val-strike-html/assets/` describe runtime asset locations and may need updating for a new asset set.

## Contributing

1. Fork the repository and create a focused branch.
2. Keep generated output, credentials, player data, and non-redistributable assets out of commits.
3. Document the affected feature and browser/device constraints in your pull request.
4. Run only the checks appropriate for the changed source; this archived handoff does not claim a complete end-to-end validation.

## License

No blanket license is provided for this handoff. Obtain permission from the project author before reusing project source, and obtain separate rights for all third-party code and content. A future maintainer should add a license only after confirming ownership and excluding material that cannot be relicensed.

# Production deployment

Domain: https://val.konmeo22132.dev

Host: `160.191.244.178` (Ubuntu 24.04, Node.js 22).

## Layout

- `/opt/val-strike/releases/`: application releases; no user data here.
- `/opt/val-strike/current`: active release symlink.
- `/var/lib/val-strike/val-strike.sqlite`: accounts, profiles, settings, history, sessions.
- `/var/lib/val-strike/backups/`: daily consistent SQLite snapshots, latest 14 retained.
- `/etc/systemd/system/val-strike.service`: unprivileged application, automatic startup/restart.
- `/etc/nginx/sites-available/val-strike`: domain, HTTPS, assets and WebSocket proxy.

The application listens only on `127.0.0.1:8455`. Nginx exposes ports 80/443. Cloudflare proxies the domain. The existing wildcard Cloudflare Origin certificate covers the domain, expires in September 2041, and is kept in `/etc/nginx/ssl/`. Keep Cloudflare proxy enabled and SSL mode Full (strict); the origin certificate is intended for Cloudflare, not direct browser access to the VPS IP.

Session cookies are HttpOnly, Secure and SameSite=Strict. Nginx accepts Cloudflare's client address only from its published IP ranges, then overwrites `X-Real-IP`; the app trusts that header only from the local proxy. This keeps login rate limits per visitor.

## Operations

```sh
ssh root@160.191.244.178
systemctl status val-strike --no-pager
journalctl -u val-strike -n 100 --no-pager
curl -fsS http://127.0.0.1:8455/api/health
systemctl restart val-strike
systemctl list-timers val-strike-backup.timer
systemctl start val-strike-backup.service
nginx -t
```

Admin account management is at `/settings` after login. Passwords are stored as salted scrypt hashes. There is no public signup.

Live rooms are held in memory; restarting the application ends current rooms. Persisted accounts, settings and match results survive restarts.

## Later releases

Upload the application into a new release directory, install dependencies with `npm ci --omit=dev` in its `tools` directory, and switch `current` before restarting the service. Preserve `/var/lib/val-strike`; never replace its database with a development copy. Take a database backup before a release. Reverting the symlink restores an earlier application version; future database schema changes may need their own rollback procedure.

The production bundle includes `server`, `tools/package*.json` and `val-strike-html`, including the raw map source files requested for the full asset set. Development conversion scripts and `node_modules` are not uploaded.

## Asset loading and upload

The entry page first downloads the runtime manifest (`4,852` files, about `1,145.7 MiB`) into browser Cache Storage. Raw map authoring files remain on the server but are excluded from preload. The menu appears after loading completes; the game waits for the same asset gate. Downloads run three at a time, validate received file lengths, retry failed requests, keep completed files across retries, and use SHA-256 revision keys so unchanged files are not downloaded again. Displayed progress does not move backwards during retries. The service worker serves cached runtime files afterward.

For a later asset or model release, run `upload.bat` from the project folder on Windows. It scans local SHA-256 checksums, shows upload percentage, reconnects interrupted SSH transfers, verifies the archive on the VPS, publishes a new release, and checks health before finishing. It never replaces `/var/lib/val-strike/val-strike.sqlite`.

## Database recovery

Stop `val-strike` before recovery. Save the existing database and its `-wal`/`-shm` files outside the active database path. Restore a selected consistent snapshot as `/var/lib/val-strike/val-strike.sqlite`, owned by `valstrike:valstrike` with mode 600; remove the old WAL/SHM from the active path before restarting. Keep the saved originals until recovery is confirmed.

Deployment does not validate WebGL rendering, gameplay balance or multiplayer latency; those require playing the published game.

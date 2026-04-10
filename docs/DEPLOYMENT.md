# Deployment

SampleTown is a SvelteKit app built with `@sveltejs/adapter-node`, so a deploy is just "run `node build/index.js` somewhere with a SQLite-writable filesystem and put a reverse proxy in front of it." Two patterns are supported out of the box: a long-running install on a Linux VM, and a portable LAN-only install for ship/field deployments.

## Production: Linux VM

`setup.sh` and `deploy.sh` at the repo root automate this. Both read overrides from environment variables (or a local `.deploy.env` file for `deploy.sh`) so they can be reused across hosts without editing.

### First-time setup

On a fresh Ubuntu/Debian VM:

```bash
curl -fsSL https://raw.githubusercontent.com/<owner>/SampleTown/main/setup.sh | bash
```

Or with overrides:

```bash
APP_DIR=/srv/sampletown PORT=3001 NODE_VERSION=20 \
    REPO_URL=https://github.com/<owner>/SampleTown.git \
    bash setup.sh
```

`setup.sh` installs Node + pm2, clones the repo, runs `npm ci && npm run build`, copies `.env.example` to `.env` (you must edit it), and starts the app under pm2 as `sampletown`. It then prints the `pm2 startup` command you should run with sudo to persist across reboots.

### Subsequent deploys

From a workstation with the repo checked out, configure once via `.deploy.env` (gitignored):

```bash
# .deploy.env
REMOTE=my-vm-host           # ssh alias or user@host
APP_DIR=/opt/sampletown
PORT=3000
BRANCH=main
```

Then:

```bash
./deploy.sh
```

This pushes to `origin/$BRANCH`, then on the remote runs `git pull && npm ci && npm run build && pm2 restart sampletown --update-env`. The `.env` file on the server is preserved.

### nginx

Point an nginx server block at `127.0.0.1:$PORT`:

```nginx
server {
    server_name sampletown.example.com;
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Then `sudo certbot --nginx -d sampletown.example.com` for TLS. **Make sure `ORIGIN` in `.env` matches the public URL** — SvelteKit's CSRF check rejects POST requests whose `Origin` header doesn't match.

### Ops

```bash
pm2 status
pm2 logs sampletown
pm2 restart sampletown
```

The SQLite DB lives at `$APP_DIR/data/sampletown.db`. Back it up by copying with the SQLite `.backup` command (safe with WAL):

```bash
sqlite3 data/sampletown.db ".backup /tmp/sampletown-$(date +%F).db"
```

## Ship / LAN mode

For deployments with no upstream internet (e.g. on a ship's internal network):

1. Set `AUTH_MODE=local` — disables GitHub OAuth, requires bcrypt local accounts
2. Set `ORIGIN` to whatever URL the LAN clients will hit (e.g. `http://10.0.0.5:3000`)
3. Leave `GITHUB_REPO` and `GITHUB_TOKEN` blank — DB snapshots queue locally and can be pushed later when back online

Run `node build/index.js` directly under pm2, or wrap it in Docker. The DB is just a file under `data/`; mount it as a volume so it survives container rebuilds.

## Configuration cheatsheet

| Variable | Production | Ship/LAN |
|---|---|---|
| `AUTH_MODE` | `github` or `hybrid` | `local` |
| `ORIGIN` | public HTTPS URL | LAN URL |
| `GITHUB_CLIENT_ID` / `_SECRET` | required | unused |
| `GITHUB_REPO` / `GITHUB_TOKEN` | required for snapshots | leave blank |
| `DB_PATH` | `data/sampletown.db` | `data/sampletown.db` |
| `ADMIN_SETUP_TOKEN` | set once for first-admin creation, unset after | same |

## Creating the first admin user

After a fresh install the `users` table is empty and there's no way to log in.
Set `ADMIN_SETUP_TOKEN` to a random value in `.env`, restart the app, then on
the login page submit the form with a hidden `setup_token` field that matches
(or use curl). The first user is created as `role=admin`. Once a user exists,
the token is ignored — you should unset it.

```bash
TOKEN=$(node -e "console.log(require('crypto').randomBytes(16).toString('hex'))")
echo "ADMIN_SETUP_TOKEN=$TOKEN" >> .env
pm2 restart sampletown --update-env

curl -X POST https://sampletown.example.com/auth/login/local \
  -d "username=admin" -d "password=<a-strong-password>" -d "setup_token=$TOKEN"

# Then unset and restart:
sed -i '/^ADMIN_SETUP_TOKEN=/d' .env
pm2 restart sampletown --update-env
```

## Troubleshooting

- **`Cross-site POST form submissions are forbidden`** — `ORIGIN` doesn't match the host the browser is hitting. Update `.env` and restart with `pm2 restart sampletown --update-env`.
- **OAuth 500 on `/auth/login/github`** — `GITHUB_CLIENT_ID/SECRET` unset, or the OAuth callback URL on GitHub doesn't match `$ORIGIN/auth/login/github/callback`.
- **`require is not defined`** in xlsx import — out-of-date build; `mixs-io.ts` must use `import * as XLSX from 'xlsx'` (ESM), never `require('xlsx')`. Rebuild with `npm run build`.
- **`UNIQUE constraint failed: constrained_values.category, value`** — that picklist entry already exists; toggle the existing row's `is_active` from the Settings page instead of re-adding it.

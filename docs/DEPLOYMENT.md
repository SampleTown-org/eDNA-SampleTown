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
    REPO_URL=https://github.com/sampletown-org/edna-sampletown.git \
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

### nginx + TLS

Point an nginx server block at `127.0.0.1:$PORT`:

```nginx
server {
    listen 80;
    server_name sampletown.example.com;
    client_max_body_size 100M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300;
    }
}
```

Then run certbot to get a Let's Encrypt cert and let it rewrite the vhost to listen on 443 with auto-HTTP→HTTPS redirect:

```bash
sudo certbot --nginx -d sampletown.example.com
```

**Three things that have to line up** for the production deploy to work:

1. **`ORIGIN` in `.env` matches the public URL exactly**, including the scheme. SvelteKit's CSRF check rejects POSTs whose `Origin` header doesn't match, and the session cookie's `Secure` flag is auto-set when `ORIGIN` starts with `https://`.
2. **The nginx vhost serves both 80 and 443** for the same hostname. If you only listen on 80, HTTPS requests will fall through to whatever default server nginx has, which on a multi-tenant VM means they'll land on someone else's app. Always run certbot — don't leave a hostname HTTP-only.
3. **The GitHub OAuth App's callback URL points at `https://<host>/auth/login/github/callback`** — the *full* path, not just `/auth/callback`. See the next section.

### GitHub OAuth setup

If you want sign-in-with-GitHub (i.e. `AUTH_MODE=github` or `hybrid`):

1. Go to <https://github.com/settings/developers> → **OAuth Apps** → **New OAuth App**.
2. Set the fields:
   - **Application name**: `SampleTown` (or whatever)
   - **Homepage URL**: `https://sampletown.example.com`
   - **Authorization callback URL**: `https://sampletown.example.com/auth/login/github/callback` ← the **full path**, not `/auth/callback`. SampleTown does not pass an explicit `redirect_uri` to GitHub, so this registered URL is what GitHub will send the user back to. Getting it wrong fails the entire flow with `mismatching_state` (the request lands on the wrong app or path).
3. Generate a client secret and copy both the client ID and secret into `.env`:
   ```
   GITHUB_CLIENT_ID=Iv23li...
   GITHUB_CLIENT_SECRET=...
   ```
4. `pm2 restart sampletown --update-env`.

**Don't reuse another app's OAuth App.** Each callback URL belongs to exactly one OAuth App in GitHub's database — if you point SampleTown at omc-platform's credentials, GitHub will redirect users to omc-platform's callback handler, which will fail to validate SampleTown's `state` and bounce them with an error.

### Creating the first admin user

On first startup (when the `users` table is empty), SampleTown automatically seeds a default account:

```
username: admin
password: admin
role:     admin
must_change_password: 1
```

The `must_change_password` flag means the first login is **forced** to the `/auth/change-password` page before any other route works. The seed never runs again once any user exists.

> **Security warning** — the literal `admin/admin` is exploitable until the first login changes it. **Always bootstrap from a private network or SSH tunnel BEFORE adding the public DNS A record / opening the firewall**:
>
> ```bash
> # On your workstation, tunnel the app port through SSH
> ssh -L 13001:127.0.0.1:3001 your-vm
>
> # In a browser, visit http://127.0.0.1:13001/auth/login
> # Sign in as admin / admin
> # You'll be redirected to /auth/change-password
> # Set a real password (≥ 10 chars)
> # Then expose the public hostname
> ```
>
> If you forget and an attacker logs in first, they'll be forced into the change-password page too — and they'll lock you out by setting their own password. The seed only fires once, so the only recovery is to delete the prod DB and re-bootstrap.

After the first admin exists, additional users are managed via **Settings → People → User Accounts**. There are two paths:

- **Add local user** — admin sets a temporary password; the new user is forced to change it on first login.
- **Approve a GitHub OAuth user** — anyone who signs in with GitHub creates a row in `users` with `is_approved=0` and is bounced to `/auth/pending`. The admin sees them in the User Accounts list with a "Pending" badge and an Approve button. Approving sets `is_approved=1` and they can sign in. (Revoking later is just toggling `is_approved=0` back; existing sessions are invalidated immediately because `validateSession` requires `is_approved=1`.)

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

## Troubleshooting

- **Every `/api/*` request returns 401 `{"error":"Authentication required"}`** — expected. Every API route requires a session except `POST /api/feedback`. Sign in via `/auth/login` first. If you don't have a user yet, see "Creating the first admin user" above.
- **`/api/settings/*`, `/api/personnel/*`, `/api/db/*` return 403 `{"error":"Admin role required"}`** — you're signed in but the user's `role` isn't `admin`. The bootstrap user is admin by default; subsequent users default to `role='user'` and need to be promoted via SQL.
- **`Cross-site POST form submissions are forbidden`** — `ORIGIN` doesn't match the host the browser is hitting. Update `.env` and `pm2 restart sampletown --update-env`. Common cause: deploying behind a new hostname without updating `ORIGIN`.
- **GitHub OAuth bounces to a "Not Found" or `mismatching_state` error on the wrong host** — the OAuth App's Authorization callback URL is pointed at the wrong app or path. It must be `https://<your-host>/auth/login/github/callback` exactly. See the GitHub OAuth setup section above.
- **HTTPS requests for your hostname land on the wrong app** (cert mismatch warning, JSON 404 from a different framework) — the nginx vhost only listens on port 80. Run `sudo certbot --nginx -d <host>` so certbot adds the 443 listener and HTTP→HTTPS redirect.
- **`OAuth state cookie missing or invalid`** — the user's browser dropped the state cookie between the GitHub redirect and the callback. Most common cause: using `http://` (cookies marked `Secure` will be dropped) or hitting the app through a session-proxy that strips path-bound cookies. Use a real `https://` hostname.
- **`require is not defined`** in xlsx import — out-of-date build; `mixs-io.ts` must use `import * as XLSX from 'xlsx'` (ESM), never `require('xlsx')`. Rebuild with `npm run build`.
- **`UNIQUE constraint failed`** on a picklist entry — that `(category, value)` already exists; toggle the existing row's `is_active` from the Settings page instead of re-adding it.
- **`SqliteError: ambiguous column name: id`** in the auth path — historical bug from an early hardening pass; if you see this on a current build, the columns in `SAFE_USER_COLS` (`src/lib/server/auth.ts`) need to be qualified with `u.` and the table aliased.

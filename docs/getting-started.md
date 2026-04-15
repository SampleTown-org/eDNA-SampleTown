# Getting started

Three different starting points. Pick the one that matches your situation.

## I'm a lab member joining an existing install

You should have an **invite link** from your lab admin that looks like:

```
https://edna.sampletown.org/auth/join/abc123…
```

1. Click the link.
2. Sign in with GitHub (top button).
3. The invite is accepted automatically; you land on the dashboard for
   your lab with the role the admin set (`user` or `viewer` typically).

If you don't have an invite, ask your lab admin to generate one in
**Manage → People → Lab Invites**.

## I want to start a new lab on an existing install

1. Go to <https://edna.sampletown.org/auth/login> (or whatever the
   primary URL is for your install) and click **Sign in with GitHub**.
2. After the GitHub OAuth round-trip you'll land on **Set up your lab**.
3. Pick **Start a new lab**, give it a name (e.g. *Cryomics Lab — UBC*),
   optionally pick a URL slug, and submit.
4. You're now the admin of a fresh lab with default picklists, primer
   sets, and PCR protocols seeded.

Your next-best clicks:

- **Create your first project** in the navbar's Projects tab.
- **Add a site** on the project detail page (sites are the prerequisite
  for samples).
- **Customize picklists** in **Manage → Picklists** if your lab uses
  storage rooms, kits, or barcodes that aren't in the default seeds.
- **Invite teammates** in **Manage → People → Lab Invites**.
- **Configure GitHub backup** in **Manage → Backup** so your data
  survives this VM. See [GitHub backup & restore](dev/backup.md) for
  the full token-permission walkthrough.

## I'm setting up a brand-new SampleTown install

You'll need a Linux VM with Node 20+, an open port, and a domain name
(or you can run on the LAN for ship/field deployments).

The full walk-through with nginx + certbot + pm2 lives in
[Deployment](ops/deployment.md). Quick version:

```bash
# On the target VM
curl -fsSL https://raw.githubusercontent.com/SampleTown-org/eDNA-SampleTown/main/setup.sh | bash

# Edit /opt/sampletown/.env to set ORIGIN, AUTH_MODE, and (if using
# GitHub OAuth) GITHUB_CLIENT_ID + GITHUB_CLIENT_SECRET.

# pm2 will already be running. To open it to the world, point an A
# record at the box and run certbot:
sudo certbot --nginx -d your-host.example.org --redirect
```

On first boot SampleTown:

1. Creates `data/sampletown.db` and applies `schema.sql`.
2. Creates a default lab (name from `DEFAULT_LAB_NAME`, fallback
   `Cryomics Lab`).
3. Seeds picklists / primer sets / PCR protocols for that lab.
4. Seeds an `admin/admin` user assigned to that lab with
   `must_change_password=1`. **Sign in once from a private network and
   change the password before exposing the install publicly.**

## After signup: minimal happy-path tour

1. **Projects → New** — name your project, optionally PI / institution /
   contact email / funding lines.
2. **Project detail page → Add Site** — drop a pin on the map, fill the
   geo / environment fields. Add photos if you have them.
3. **Add Sample** (becomes available once the project has at least one
   site) — pick the site, fill the MIxS-required fields (the form
   highlights them in red and shows a "N of M filled" progress bar).
4. **Print a label or scan a pre-printed one** — see [Scanning &
   labels](user/scanning.md) for the QR sticker workflow.
5. **Run your first backup** — Manage → Backup → configure repo + token
   → "Backup now". See [GitHub backup & restore](dev/backup.md).

That's the floor. The [User guide](user/index.md) covers the
rest in detail.

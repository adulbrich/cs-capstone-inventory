# Production Deployment Guide: AWS EC2 + Coolify + Self-Hosted Supabase

This guide walks through deploying the inventory management app to production on AWS manually, step by step. No prior DevOps experience required — just an AWS account, a domain name, and an SSH client.

> **Terraform alternative:** If you prefer infrastructure-as-code, see [Appendix A: Terraform](#appendix-a-terraform) which provisions all AWS resources automatically.

---

## What You'll End Up With

```
Internet
  └── AWS EC2 (t3.medium, Ubuntu 24.04)
        ├── Caddy (automatic HTTPS via Let's Encrypt)
        │     ├── yourdomain.com      → SvelteKit app (port 3000)
        │     └── yourdomain.com/api  → Supabase Kong gateway (port 8000)
        └── Coolify (Docker-based PaaS — internal only, SSH tunnel to access)
              ├── Supabase stack (DB, Auth, Storage, Studio — all internal)
              └── SvelteKit app container
```

**Ports open to internet:** 80, 443, 22 (SSH — restricted to your IP)
**Ports never open:** 5432 (Postgres), 3000 (Studio), 8000 (Coolify), everything else

> **Why is `/api` public?** Supabase has two types of traffic. Database queries go server-to-server (private). But auth flows — including SSO — require the **browser** to talk to Supabase directly: the browser initiates the redirect, OSU's identity server posts the SAML assertion back to your Supabase ACS endpoint, and Supabase redirects the browser to your `/auth/callback`. All of this happens at the network level between OSU's servers and yours. The `/api` route exposes only the Supabase API (Kong gateway), never the database port.

---

## Order of Operations

The deployment has some apparent chicken-and-egg dependencies. Here is the correct order so nothing blocks you:

```
1. Allocate Elastic IP (do this NOW — 2 minutes, free)
        │
        ▼
2. Email OSU IT with two requests in one message:
   - Subdomain DNS: point yourcapstone.oregonstate.edu → <Elastic IP>
   - SSO registration: your ACS URL is already known (see SSO guide)
   OSU IT works on both in parallel. Continue while you wait.
        │
        ▼
3. Launch EC2, install Docker + Coolify, deploy Supabase + app
        │
        ▼
4. Once OSU IT sets the DNS → Let's Encrypt certificate issues automatically
        │
        ▼
5. Configure Supabase SITE_URL and API_EXTERNAL_URL with your final domain
        │
        ▼
6. Once OSU IT responds with their IdP metadata → add it to Supabase
        │
        ▼
7. Test SSO end-to-end
```

**Key insight:** You can give OSU IT your ACS URL before the server is deployed because the URL format is predictable — it's always `https://yourdomain.com/api/auth/v1/sso/saml/acs`. Sending both requests in one email saves a full round-trip that could cost days.

---

## Prerequisites

- AWS account with billing enabled
- A domain name (from any registrar: Namecheap, Cloudflare, Route 53, etc.) — **or** you can use an `oregonstate.edu` subdomain from OSU IT
- A computer with `ssh` installed (macOS/Linux: built-in; Windows: use WSL or Git Bash)

---

## Step 1 — Launch an EC2 Instance (AWS Console)

### 1.1 Create a Key Pair

Before launching, create an SSH key pair so you can log in.

1. Go to **AWS Console → EC2 → Key Pairs** (under "Network & Security")
2. Click **Create key pair**
3. Name: `capstone-inventory-key`
4. Type: RSA, format: `.pem`
5. Click **Create** — your browser downloads `capstone-inventory-key.pem`
6. Move it somewhere safe and restrict permissions:
   ```bash
   mv ~/Downloads/capstone-inventory-key.pem ~/.ssh/
   chmod 400 ~/.ssh/capstone-inventory-key.pem
   ```

### 1.2 Create a Security Group

1. Go to **EC2 → Security Groups** → **Create security group**
2. Name: `capstone-inventory-sg`, VPC: your default VPC
3. Add inbound rules:

   | Type | Port | Source | Note |
   |------|------|--------|------|
   | SSH | 22 | 128.193.0.0/16 | OSU network CIDR, or your current IP |
   | HTTP | 80 | 0.0.0.0/0 | Let's Encrypt verification + redirect to HTTPS |
   | HTTPS | 443 | 0.0.0.0/0 | Production traffic |

4. Leave outbound: all traffic → 0.0.0.0/0 (default)
5. Click **Create security group**

> **Important:** The SSH restriction means you can only SSH from that network. If you change networks, update this rule in the AWS Console (EC2 → Security Groups → edit inbound rules).

### 1.3 Launch the Instance

1. Go to **EC2 → Instances → Launch instances**
2. Name: `capstone-inventory`
3. **AMI:** Search for `Ubuntu Server 24.04 LTS` → select the 64-bit (x86) HVM option
4. **Instance type:** `t3.medium` (2 vCPU, 4 GB RAM — minimum for self-hosted Supabase)
5. **Key pair:** select `capstone-inventory-key`
6. **Security group:** select `capstone-inventory-sg`
7. **Storage:** Change root volume to **30 GB, gp3**. Check "**Delete on termination: No**" — this keeps your data if the instance is accidentally terminated.
8. Click **Launch instance**

### 1.4 Allocate an Elastic IP

An Elastic IP is a static public IP that stays the same even if you stop/restart the instance.

1. **EC2 → Elastic IPs → Allocate Elastic IP address**
2. Leave defaults → **Allocate**
3. Select the new IP → **Actions → Associate Elastic IP address**
4. Choose your instance → **Associate**
5. **Note this IP** — you'll use it for DNS, SSH, and to send to OSU IT

> **Do this first.** You can allocate an Elastic IP before the EC2 instance is even running. The IP is yours as soon as it's allocated, so you can share it with OSU IT immediately.

---

## Step 2 — Configure DNS

Point your domain at the Elastic IP.

**If using your own domain (Namecheap, Cloudflare, etc.):**

Log in to your registrar and add:

| Record Type | Name | Value | TTL |
|-------------|------|-------|-----|
| A | `@` (or `yourdomain.com`) | `<Elastic IP>` | 300 |
| A | `www` | `<Elastic IP>` | 300 |

**If using an OSU subdomain:**

Include the Elastic IP in your OSU IT email (see Order of Operations above). OSU IT will create the DNS record on their side. You have no action here until they respond.

DNS propagates within minutes to hours. You can check with:
```bash
dig yourdomain.com +short
# Should return your Elastic IP
```

---

## Step 3 — Connect to the Server and Install Docker

```bash
# SSH into your new server
ssh -i ~/.ssh/capstone-inventory-key.pem ubuntu@<ELASTIC_IP>
```

Once connected, install Docker:

```bash
# Update packages
sudo apt-get update -y

# Install Docker's GPG key and repo
sudo apt-get install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc

sudo tee /etc/apt/sources.list.d/docker.sources <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}")
Components: stable
Signed-By: /etc/apt/keyrings/docker.asc
EOF

sudo apt-get update -y
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Start Docker and make it start on boot
sudo systemctl enable docker
sudo systemctl start docker

# Let the ubuntu user run docker without sudo
sudo usermod -aG docker ubuntu
newgrp docker

# Verify
docker --version
```

> **Why Docker and not Podman?** Coolify (the deployment tool used in this guide) is built on Docker and uses the Docker socket directly. Podman's Docker-compatibility mode is not officially supported by Coolify. If you prefer Podman, see [Appendix B: Deploying Supabase with Podman (without Coolify)](#appendix-b-deploying-supabase-with-podman-without-coolify).

---

## Step 4 — Install Coolify

Coolify is a self-hosted Heroku/Vercel alternative. It manages Docker containers, handles SSL via Caddy, and gives you a web UI to deploy and monitor services.

```bash
# On the server:
curl -fsSL https://cdn.coollabs.io/coolify/install.sh | sudo bash
```

This installs Coolify and starts it on port `8000`. Wait ~60 seconds for it to fully start.

---

## Step 5 — Access Coolify via SSH Tunnel

Coolify's dashboard should **never be open to the internet**. Access it through an SSH tunnel instead.

**On your local machine** (new terminal window, keep the server SSH open separately):

```bash
ssh -i ~/.ssh/capstone-inventory-key.pem -N -L 8000:localhost:8000 ubuntu@<ELASTIC_IP>
```

Now open `http://localhost:8000` in your browser. You're securely accessing Coolify through the encrypted SSH tunnel.

### First-Time Setup Wizard

1. **Create admin account** — use a strong password, save it in your password manager
2. **Server setup:** Choose **"This server"** (Coolify manages the same EC2 it's running on)
3. **Verify server:** Coolify SSHs into itself to confirm Docker access — click Validate
4. Once validated, you're in the Coolify dashboard

---

## Step 6 — Deploy Self-Hosted Supabase via Coolify

### 6.1 Create a Project

In Coolify: **Projects → New Project** → name it `inventory-supabase` → **Create**

### 6.2 Add Supabase

1. Click **New Resource** → **Docker Compose** → search for **Supabase** in the template list
2. Select the Supabase template → **Continue**
3. Coolify pulls the official Supabase Docker Compose configuration

### 6.3 Generate Required Secrets

Before filling in environment variables, generate the secrets you'll need:

```bash
# Run these on your local machine (or anywhere with openssl):

# Postgres password
openssl rand -base64 32

# JWT secret (must be at least 32 characters)
openssl rand -base64 40

# Dashboard password
openssl rand -base64 16
```

**Generate JWT keys** — Supabase needs two signed JWTs using your JWT secret:

```bash
JWT_SECRET="your-jwt-secret-here"
node -e "
const crypto = require('crypto');
function makeJWT(payload) {
  const header = Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', '$JWT_SECRET').update(header+'.'+body).digest('base64url');
  return header+'.'+body+'.'+sig;
}
const now = Math.floor(Date.now()/1000);
const exp = now + 100*365*24*3600;
console.log('ANON_KEY=', makeJWT({role:'anon',iss:'supabase',iat:now,exp}));
console.log('SERVICE_ROLE_KEY=', makeJWT({role:'service_role',iss:'supabase',iat:now,exp}));
"
```

### 6.4 Configure Environment Variables in Coolify

In the Supabase resource's environment editor, set:

```env
POSTGRES_PASSWORD=<generated-above>
JWT_SECRET=<generated-above>
ANON_KEY=<generated-anon-jwt>
SERVICE_ROLE_KEY=<generated-service-role-jwt>

DASHBOARD_USERNAME=supabase
DASHBOARD_PASSWORD=<generated-above>

# Your domain — these must be set to your final domain, not an IP
API_EXTERNAL_URL=https://yourdomain.com/api
SITE_URL=https://yourdomain.com

# Email (required for auth emails — use SendGrid free tier or similar)
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=<sendgrid-api-key>
SMTP_ADMIN_EMAIL=noreply@yourdomain.com
SMTP_SENDER_NAME=Inventory System
```

> **Note on `SITE_URL` and `API_EXTERNAL_URL`:** These must be the final public domain — they're embedded into auth emails and OAuth redirect validation. If you don't have the domain yet, deploy with a placeholder and update them once DNS resolves. Restart the auth service after changing them.

> **SMTP:** Without SMTP, users won't receive password reset emails. SendGrid has a free tier (100 emails/day). Sign up at sendgrid.com and create an API key.

### 6.5 Configure Domains in Coolify

In the Supabase resource's **Domains** section, set the **Kong** (API gateway) service to route from `yourdomain.com/api`. Coolify will configure Caddy to reverse-proxy this automatically.

Leave Supabase Studio and all other internal services without a public domain — they stay internal.

### 6.6 Start Supabase

Click **Deploy** in Coolify. Supabase starts all containers (db, auth, rest, storage, Kong, studio). This takes 2–3 minutes. Watch the logs in Coolify to confirm all services start successfully.

---

## Step 7 — Run Database Migrations

Connect to Postgres through an SSH tunnel:

```bash
# Terminal 1: open tunnel
ssh -i ~/.ssh/capstone-inventory-key.pem -N -L 5432:localhost:5432 ubuntu@<ELASTIC_IP>

# Terminal 2: push migrations (from your project root)
supabase db push --db-url "postgresql://postgres:<POSTGRES_PASSWORD>@localhost:5432/postgres"
```

This runs all migrations in `supabase/migrations/` in order.

---

## Step 8 — Deploy the SvelteKit App via Coolify

### 8.1 Create a Dockerfile

In your project root, create `Dockerfile`:

```dockerfile
FROM node:22-alpine AS builder
WORKDIR /app

RUN npm install -g bun

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .
RUN bun run build

FROM node:22-alpine AS runner
WORKDIR /app

COPY --from=builder /app/build ./build
COPY --from=builder /app/package.json ./

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000
CMD ["node", "build"]
```

Commit and push to GitHub:
```bash
git add Dockerfile
git commit -m "chore: add production Dockerfile"
git push
```

### 8.2 Add SvelteKit as a Coolify Resource

1. Coolify → your project → **New Resource** → **Public Git Repository**
2. Enter your GitHub repo URL
3. Build pack: **Dockerfile**
4. Coolify detects the `Dockerfile` automatically

### 8.3 Set Environment Variables

```env
PUBLIC_SUPABASE_URL=https://yourdomain.com/api
PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
ORIGIN=https://yourdomain.com
PORT=3000
```

### 8.4 Set the Domain

In Coolify's Domains section for the SvelteKit resource, set the domain to `yourdomain.com`. Coolify configures Caddy to route traffic and handle SSL automatically.

### 8.5 Deploy

Click **Deploy**. Coolify builds the Docker image, starts the container, and the app goes live at `https://yourdomain.com`.

---

## Step 9 — Access Supabase Studio Safely

Supabase Studio runs internally. Access it only via SSH tunnel:

```bash
# Find the Studio port first:
ssh ubuntu@<ELASTIC_IP> "docker ps | grep studio"

# Open tunnel (adjust port if different from 5000):
ssh -i ~/.ssh/capstone-inventory-key.pem -N -L 54321:localhost:5000 ubuntu@<ELASTIC_IP>
```

Open `http://localhost:54321` — you're in Studio through the encrypted SSH tunnel. Log in with `DASHBOARD_USERNAME` / `DASHBOARD_PASSWORD`.

**Convenience aliases** (add to `~/.zshrc` or `~/.bash_profile`):
```bash
alias studio-tunnel='ssh -i ~/.ssh/capstone-inventory-key.pem -N -L 54321:localhost:5000 ubuntu@<ELASTIC_IP>'
alias coolify-tunnel='ssh -i ~/.ssh/capstone-inventory-key.pem -N -L 8000:localhost:8000 ubuntu@<ELASTIC_IP>'
alias db-tunnel='ssh -i ~/.ssh/capstone-inventory-key.pem -N -L 5432:localhost:5432 ubuntu@<ELASTIC_IP>'
```

---

## Step 10 — Database Backups

### 10.1 Create the Backup Script

On the server:
```bash
sudo tee /opt/backup-db.sh <<'EOF'
#!/bin/bash
set -euo pipefail

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="/tmp/db_backup_${TIMESTAMP}.sql.gz"

DB_CONTAINER=$(docker ps --format '{{.Names}}' | grep -E 'supabase.*db|db.*supabase' | head -1)

echo "[$(date)] Starting backup (container: $DB_CONTAINER)..."

docker exec "$DB_CONTAINER" pg_dump -U postgres postgres | gzip > "$BACKUP_FILE"

# Upload to S3
aws s3 cp "$BACKUP_FILE" "s3://BUCKET_NAME/daily/db_backup_${TIMESTAMP}.sql.gz"

rm "$BACKUP_FILE"
echo "[$(date)] Backup uploaded to S3."
EOF

sudo chmod +x /opt/backup-db.sh
```

**S3 bucket:** Create one in the AWS Console (S3 → Create bucket). Attach an IAM role to your EC2 instance with S3 write access (recommended — no credentials stored on disk).

### 10.2 Schedule with Cron

```bash
sudo crontab -e

# Add this line — runs at 3:00 AM UTC daily:
0 3 * * * /opt/backup-db.sh >> /var/log/db-backup.log 2>&1
```

### 10.3 Test the Backup

```bash
sudo /opt/backup-db.sh
aws s3 ls s3://BUCKET_NAME/daily/
```

### 10.4 Restore from Backup

```bash
aws s3 cp s3://BUCKET_NAME/daily/db_backup_<timestamp>.sql.gz /tmp/restore.sql.gz

DB_CONTAINER=$(docker ps --format '{{.Names}}' | grep -E 'supabase.*db' | head -1)
gunzip -c /tmp/restore.sql.gz | docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres
```

---

## Step 11 — Deploying App Updates

### Option A: Manual Redeploy (simplest)

In Coolify → your SvelteKit resource → click **Redeploy**. Coolify pulls the latest commit from GitHub, rebuilds the image, and swaps the container with zero-downtime.

### Option B: Auto-Deploy on Git Push (recommended)

1. In Coolify → your SvelteKit resource → **Settings** → enable **Auto Deploy**
2. Coolify registers a webhook in your GitHub repository
3. Every push to the configured branch triggers a new build automatically — no manual steps

To see webhook status: GitHub repo → Settings → Webhooks.

### Option C: Deploy via Coolify API (CI/CD pipelines)

Coolify exposes a REST API you can call from GitHub Actions or any CI system:

```bash
# Get your API key: Coolify dashboard → Profile → API Keys → Create
curl -X POST "http://localhost:8000/api/v1/deploy" \
  -H "Authorization: Bearer <COOLIFY_API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{ "uuid": "<resource-uuid>" }'
```

Find the resource UUID in Coolify → your resource → Settings → UUID.

Example GitHub Actions workflow (`.github/workflows/deploy.yml`):
```yaml
name: Deploy to Production
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger Coolify deploy
        run: |
          curl -X POST "${{ secrets.COOLIFY_URL }}/api/v1/deploy" \
            -H "Authorization: Bearer ${{ secrets.COOLIFY_API_KEY }}" \
            -H "Content-Type: application/json" \
            -d '{ "uuid": "${{ secrets.COOLIFY_RESOURCE_UUID }}" }'
```

Store `COOLIFY_URL` (your SSH-tunneled address or a private endpoint), `COOLIFY_API_KEY`, and `COOLIFY_RESOURCE_UUID` as GitHub repository secrets.

### Option D: Rollback

Coolify keeps a history of previous deployments. To roll back: Coolify → your resource → **Deployments** tab → find the previous successful deploy → **Redeploy**.

### Deploying Database Migrations

Migrations are separate from the app container — run them manually:

```bash
# Open SSH tunnel to Postgres
ssh -i ~/.ssh/capstone-inventory-key.pem -N -L 5432:localhost:5432 ubuntu@<ELASTIC_IP> &

# Push migrations
supabase db push --db-url "postgresql://postgres:<PASSWORD>@localhost:5432/postgres"

# Close tunnel
kill %1
```

Run migrations **before** deploying the app update when a release adds new tables or columns, so the app never queries a schema that doesn't exist yet.

---

## Step 12 — Updating Supabase Itself

Supabase periodically releases new versions of their Docker images (auth, storage, realtime, etc.). Staying reasonably current gets you bug fixes and security patches.

### Check for Updates

Supabase publishes release notes at [github.com/supabase/supabase/releases](https://github.com/supabase/supabase/releases). There's no automatic notification — check occasionally or watch the repo.

### Before Updating: Take a Backup

**Always back up before updating Supabase:**

```bash
ssh ubuntu@<ELASTIC_IP> sudo /opt/backup-db.sh
```

Verify the backup appeared in S3 before proceeding.

### Update Supabase in Coolify

1. In Coolify → your Supabase resource → **Settings**
2. Review the Docker image tags. The Supabase Coolify template pins images to specific versions (e.g., `supabase/gotrue:v2.x.x`)
3. Update each image tag to the new version
4. Click **Save** then **Redeploy**
5. Coolify pulls the new images and restarts the containers one by one

> **Read the release notes first.** Most Supabase updates are backwards-compatible, but major versions occasionally require running a migration on the internal `supabase_migrations` schema. Release notes will call this out explicitly.

### After Updating: Verify

```bash
# Check all Supabase containers are running
ssh ubuntu@<ELASTIC_IP> "docker ps | grep supabase"

# Test auth endpoint
curl https://yourdomain.com/api/auth/v1/health

# Test PostgREST
curl https://yourdomain.com/api/rest/v1/items \
  -H "apikey: <ANON_KEY>"
```

If anything breaks, Coolify lets you redeploy the previous version from the Deployments tab, and you can restore the database from your backup.

---

## Deploying Multiple Apps on One Coolify Server

If you have a second app with a similar stack (SvelteKit + Supabase), you have three deployment options:

### Option A: Same EC2, Separate Supabase per App

Each app gets its own Supabase stack and its own SvelteKit container, all on the same EC2 and managed by the same Coolify.

```
EC2 (t3.large or bigger)
  └── Coolify
        ├── Project: inventory-app
        │     ├── Supabase stack (ports internal)
        │     └── SvelteKit → inventory.yourdomain.com
        └── Project: other-app
              ├── Supabase stack (ports internal)
              └── SvelteKit → other.yourdomain.com
```

**Good when:**
- Apps have separate data (no sharing needed)
- You want full isolation — one app's DB problems can't affect the other
- You want to take apps offline independently

**Watch out for:**
- Two Supabase stacks together consume ~1.5–2 GB RAM just at idle. A `t3.medium` (4 GB) will be tight. Use a `t3.large` (8 GB, ~$60/mo) or `t3.xlarge` (16 GB, ~$120/mo) depending on load.
- Check resource usage on the server: `htop` or `docker stats`

**In Coolify:** Just create a second Project and add a new Supabase resource + SvelteKit resource to it. Coolify handles routing both domains through Caddy automatically.

### Option B: Same EC2, Shared Supabase

One Supabase instance serves both apps. Each app gets its own schema or uses separate tables and RLS policies.

```
EC2 (t3.medium is fine)
  └── Coolify
        ├── Supabase stack (one, shared)
        ├── SvelteKit: inventory → inventory.yourdomain.com
        └── SvelteKit: other-app → other.yourdomain.com
```

**Good when:**
- Apps are related (e.g., two capstone tools for the same program)
- You want the cheapest possible setup
- You're okay managing a single database for both

**Watch out for:**
- RLS policies and migrations for both apps live in the same DB — keep them organized
- If you need to wipe the DB for one app, it affects both
- Shared `auth.users` table — SSO logins create users in both apps' pool

**In Coolify:** Deploy Supabase once. Give both SvelteKit apps the same `PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_ANON_KEY` (but use separate service role keys if needed).

### Option C: Separate EC2 per App

Each app gets its own EC2 instance, Coolify installation, and Supabase stack.

```
EC2 #1 (t3.medium)            EC2 #2 (t3.medium)
  └── Coolify                   └── Coolify
        ├── Supabase                  ├── Supabase
        └── inventory-app             └── other-app
```

**Good when:**
- Apps have very different scaling needs or traffic patterns
- You need strict security isolation (different AWS accounts, VPCs)
- One app is resource-heavy and would starve the other

**Watch out for:**
- Doubles cost (~$38–42/mo × 2)
- Two servers to maintain and update

### Which Option to Choose?

| | Same server, separate Supabase | Same server, shared Supabase | Separate servers |
|--|--|--|--|
| Cost | ~$60–120/mo | ~$38–42/mo | ~$76–84/mo |
| Isolation | Good | Low | Full |
| Complexity | Low | Medium | Low |
| Best for | 2 unrelated apps | 2 related apps | Very different workloads |

For two capstone-style apps with low traffic, **Option A on a `t3.large`** is the cleanest choice: full isolation, simple setup, one server to maintain.

---

## Security Checklist

Before going live, verify:

- [ ] SSH security group rule is restricted to your IP(s), not `0.0.0.0/0`
- [ ] Coolify dashboard accessible only via SSH tunnel (port 8000 NOT open in security group)
- [ ] Supabase Studio accessible only via SSH tunnel
- [ ] Postgres port 5432 NOT in security group
- [ ] `JWT_SECRET` is ≥ 32 random characters and unique
- [ ] `POSTGRES_PASSWORD` is strong and saved securely
- [ ] EC2 root volume has "Delete on termination" set to **No**
- [ ] Supabase service role key is only in server-side environment variables, never client-side
- [ ] SMTP configured so auth emails are deliverable
- [ ] Backups tested — restore one backup to a test DB to confirm it works
- [ ] `SITE_URL` and `API_EXTERNAL_URL` match your final domain exactly

---

## Cost Estimate

| Resource | Monthly (us-west-2) |
|----------|---------------------|
| EC2 t3.medium (1 app) | ~$34 |
| EC2 t3.large (2 apps) | ~$60 |
| EBS 30 GB gp3 | ~$2.40 |
| Elastic IP | Free while attached |
| S3 backups (~5 GB) | ~$0.12 |
| Data transfer | ~$1–5 |
| **Total (1 app, t3.medium)** | **~$38–42/month** |
| **Total (2 apps, t3.large)** | **~$64–68/month** |

> **Scaling:** If the server feels slow, upgrade the instance type in EC2 Console → Actions → Instance Settings → Change instance type (requires a brief stop/start, no data loss).

---

## Quick Reference

```bash
# SSH into server
ssh -i ~/.ssh/capstone-inventory-key.pem ubuntu@<ELASTIC_IP>

# Open Coolify dashboard
ssh -i ~/.ssh/capstone-inventory-key.pem -N -L 8000:localhost:8000 ubuntu@<ELASTIC_IP>
# → http://localhost:8000

# Open Supabase Studio
ssh -i ~/.ssh/capstone-inventory-key.pem -N -L 54321:localhost:5000 ubuntu@<ELASTIC_IP>
# → http://localhost:54321

# Push database migrations
ssh -i ~/.ssh/capstone-inventory-key.pem -N -L 5432:localhost:5432 ubuntu@<ELASTIC_IP> &
supabase db push --db-url "postgresql://postgres:<PASSWORD>@localhost:5432/postgres"
kill %1

# Manual backup
ssh ubuntu@<ELASTIC_IP> sudo /opt/backup-db.sh

# Check all container statuses
ssh ubuntu@<ELASTIC_IP> "docker ps --format 'table {{.Names}}\t{{.Status}}'"

# View app logs
ssh ubuntu@<ELASTIC_IP> "docker logs -f \$(docker ps -q -f name=sveltekit)"

# Restart a container (e.g., after env var change)
ssh ubuntu@<ELASTIC_IP> "docker restart \$(docker ps -q -f name=sveltekit)"

# Check resource usage
ssh ubuntu@<ELASTIC_IP> "docker stats --no-stream"
```

---

## Troubleshooting

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| Site shows 502 | SvelteKit container stopped | Check Coolify logs; click Redeploy |
| Supabase auth fails | `PUBLIC_SUPABASE_URL` wrong or `/api` not routing | Confirm `yourdomain.com/api` routes to Kong; check Supabase logs |
| SSO redirect fails | `API_EXTERNAL_URL` mismatch | Must match exactly what OSU IT registered as your ACS domain |
| Studio won't load | Tunnel not open or wrong port | Run `docker ps \| grep studio` on server to find port |
| Migration push fails | SSH tunnel not active | Start the tunnel first, then push |
| Let's Encrypt SSL fails | DNS not propagated yet | Wait and retry; check `dig yourdomain.com` |
| Can't SSH anymore | Your IP changed | Update SSH inbound rule in AWS Security Group |
| Server feels slow | Running two Supabase stacks on t3.medium | Upgrade instance type; check `docker stats` |

---

## Appendix A: Terraform

If you prefer to provision AWS infrastructure as code (repeatable, version-controlled), use these Terraform files instead of the manual Steps 1–2.

> **Prerequisite:** Install Terraform (`brew install terraform`) and AWS CLI (`brew install awscli && aws configure`).

Create an `infra/` directory in the project root.

### `infra/main.tf`

```hcl
terraform {
  required_version = ">= 1.7"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.0" }
  }
}

provider "aws" {
  region = var.aws_region
}

resource "aws_vpc" "main" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_hostnames = true
  tags = { Name = "${var.app_name}-vpc" }
}

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id
}

resource "aws_subnet" "public" {
  vpc_id                  = aws_vpc.main.id
  cidr_block              = "10.0.1.0/24"
  availability_zone       = "${var.aws_region}a"
  map_public_ip_on_launch = true
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id
  route { cidr_block = "0.0.0.0/0"; gateway_id = aws_internet_gateway.main.id }
}

resource "aws_route_table_association" "public" {
  subnet_id      = aws_subnet.public.id
  route_table_id = aws_route_table.public.id
}

resource "aws_security_group" "app" {
  name   = "${var.app_name}-sg"
  vpc_id = aws_vpc.main.id

  ingress { from_port = 22;  to_port = 22;  protocol = "tcp"; cidr_blocks = var.ssh_allowed_cidrs }
  ingress { from_port = 80;  to_port = 80;  protocol = "tcp"; cidr_blocks = ["0.0.0.0/0"] }
  ingress { from_port = 443; to_port = 443; protocol = "tcp"; cidr_blocks = ["0.0.0.0/0"] }
  egress  { from_port = 0;   to_port = 0;   protocol = "-1";  cidr_blocks = ["0.0.0.0/0"] }
}

data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"]
  filter { name = "name"; values = ["ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-amd64-server-*"] }
}

resource "aws_instance" "app" {
  ami                    = data.aws_ami.ubuntu.id
  instance_type          = var.instance_type
  key_name               = var.key_pair_name
  subnet_id              = aws_subnet.public.id
  vpc_security_group_ids = [aws_security_group.app.id]

  root_block_device {
    volume_type           = "gp3"
    volume_size           = 30
    delete_on_termination = false
    encrypted             = true
  }

  user_data = <<-EOF
    #!/bin/bash
    set -e
    apt-get update -y
    apt-get install -y ca-certificates curl
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
    chmod a+r /etc/apt/keyrings/docker.asc
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" | tee /etc/apt/sources.list.d/docker.list
    apt-get update -y
    apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
    systemctl enable docker && systemctl start docker
    usermod -aG docker ubuntu
    curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash
  EOF

  tags = { Name = var.app_name }
}

resource "aws_eip" "app" {
  instance = aws_instance.app.id
  domain   = "vpc"
}

output "elastic_ip"  { value = aws_eip.app.public_ip }
output "ssh_command" { value = "ssh -i ~/.ssh/${var.key_pair_name}.pem ubuntu@${aws_eip.app.public_ip}" }
```

### `infra/variables.tf`

```hcl
variable "aws_region"        { default = "us-west-2" }
variable "app_name"          { default = "capstone-inventory" }
variable "instance_type"     { default = "t3.medium" }
variable "key_pair_name"     { type = string }
variable "ssh_allowed_cidrs" { type = list(string); default = ["0.0.0.0/0"] }  # change to your IP/OSU CIDR
```

### Usage

```bash
cd infra/
terraform init
terraform plan -var="key_pair_name=capstone-inventory-key"
terraform apply -var="key_pair_name=capstone-inventory-key"
# After apply, note the elastic_ip output and continue from Step 2 (DNS) above
```

---

## Appendix B: Deploying Supabase with Podman (without Coolify)

If you prefer Podman over Docker, you must skip Coolify (which requires Docker). Deploy Supabase manually instead, and use a separate tool (or Caddy directly) for the SvelteKit app.

> This approach is more manual and loses Coolify's deployment UI, logs viewer, and auto-deploy features.

### Install Podman and podman-compose

```bash
sudo apt-get install -y podman
pip3 install podman-compose
```

### Deploy Supabase

```bash
git clone --depth 1 https://github.com/supabase/supabase
cd supabase/docker
cp .env.example .env
nano .env  # Fill in POSTGRES_PASSWORD, JWT_SECRET, ANON_KEY, SERVICE_ROLE_KEY, etc.
podman-compose up -d
```

### Run SvelteKit with a Podman container

```bash
podman build -t capstone-inventory .
podman run -d \
  --name capstone-inventory \
  -p 3000:3000 \
  -e PUBLIC_SUPABASE_URL=... \
  -e PUBLIC_SUPABASE_ANON_KEY=... \
  -e ORIGIN=https://yourdomain.com \
  capstone-inventory
```

### Reverse Proxy with Caddy

Install Caddy and create `/etc/caddy/Caddyfile`:
```
yourdomain.com {
    handle /api/* {
        reverse_proxy localhost:8000  # Supabase Kong
    }
    handle {
        reverse_proxy localhost:3000  # SvelteKit
    }
}
```

```bash
sudo apt-get install -y caddy
sudo systemctl enable caddy && sudo systemctl start caddy
```

Caddy handles HTTPS/Let's Encrypt automatically.

> **Podman systemd integration:** Use `podman generate systemd` to create systemd unit files so containers restart on boot — equivalent to Docker's `--restart=always`.

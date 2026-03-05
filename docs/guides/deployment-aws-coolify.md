# Production Deployment Guide: AWS EC2 + Coolify + Self-Hosted Supabase

This guide walks through deploying the inventory management app to production on AWS manually, step by step. No prior DevOps experience required — just an AWS account, a domain name, and an SSH client.

> **Terraform alternative:** If you prefer infrastructure-as-code, see [Appendix A: Terraform](#appendix-a-terraform) which provisions all AWS resources automatically.

---

## What You'll End Up With

```
Internet
  └── AWS EC2 (t3.medium, Ubuntu 24.04)
        ├── Caddy (automatic HTTPS via Let's Encrypt)
        │     ├── yourdomain.com → SvelteKit app
        │     └── yourdomain.com/api → Supabase Kong gateway
        └── Coolify (Docker-based PaaS — internal only, SSH tunnel to access)
              ├── Supabase stack (DB, Auth, Storage, Studio — all internal)
              └── SvelteKit app container

Your laptop
  └── SSH tunnel → Supabase Studio (safe, never open to internet)
  └── SSH tunnel → Coolify dashboard (safe, never open to internet)
```

**Ports open to internet:** 80, 443, 22 (SSH — you'll restrict this to your IP)
**Ports never open:** 5432 (Postgres), 3000 (Studio), 8000 (Coolify), everything else

---

## Prerequisites

- AWS account with billing enabled
- A domain name (from any registrar: Namecheap, Cloudflare, Route 53, etc.)
- A computer with `ssh` installed (macOS/Linux: built-in; Windows: use WSL or Git Bash)

---

## Step 1 — Launch an EC2 Instance (AWS Console)

### 1.1 Create a Key Pair

Before launching, create an SSH key pair so you can log in.

1. Go to **AWS Console → EC2 → Key Pairs** (under "Network & Security")
2. Click **Create key pair**
3. Name: `inventory-app-key`
4. Type: RSA, format: `.pem`
5. Click **Create** — your browser downloads `inventory-app-key.pem`
6. Move it somewhere safe and restrict permissions:
   ```bash
   mv ~/Downloads/inventory-app-key.pem ~/.ssh/
   chmod 400 ~/.ssh/inventory-app-key.pem
   ```

### 1.2 Create a Security Group

1. Go to **EC2 → Security Groups** → **Create security group**
2. Name: `inventory-app-sg`, VPC: your default VPC
3. Add inbound rules:

   | Type | Port | Source | Note |
   |------|------|--------|------|
   | SSH | 22 | My IP | AWS fills this in — your current IP only |
   | HTTP | 80 | 0.0.0.0/0 | Let's Encrypt verification + redirect to HTTPS |
   | HTTPS | 443 | 0.0.0.0/0 | Production traffic |

4. Leave outbound: all traffic → 0.0.0.0/0 (default)
5. Click **Create security group**

> **Important:** The "My IP" restriction on SSH means you can only SSH from your current IP. If you change networks, update this rule in the AWS Console (EC2 → Security Groups → edit inbound rules).

### 1.3 Launch the Instance

1. Go to **EC2 → Instances → Launch instances**
2. Name: `inventory-app`
3. **AMI:** Search for `Ubuntu Server 24.04 LTS` → select the 64-bit (x86) HVM option
4. **Instance type:** `t3.medium` (2 vCPU, 4 GB RAM — minimum for self-hosted Supabase)
5. **Key pair:** select `inventory-app-key`
6. **Security group:** select `inventory-app-sg`
7. **Storage:** Change root volume to **30 GB, gp3**. Check "**Delete on termination: No**" — this keeps your data if the instance is accidentally terminated.
8. Click **Launch instance**

### 1.4 Allocate an Elastic IP

An Elastic IP is a static public IP that stays the same even if you stop/restart the instance.

1. **EC2 → Elastic IPs → Allocate Elastic IP address**
2. Leave defaults → **Allocate**
3. Select the new IP → **Actions → Associate Elastic IP address**
4. Choose your instance → **Associate**
5. **Note this IP** — you'll use it for DNS and SSH

---

## Step 2 — Configure DNS

Point your domain at the Elastic IP.

Log in to your domain registrar and add:

| Record Type | Name | Value | TTL |
|-------------|------|-------|-----|
| A | `@` (or `yourdomain.com`) | `<Elastic IP>` | 300 |
| A | `www` | `<Elastic IP>` | 300 |

DNS propagates within minutes to hours. You can check with:
```bash
dig yourdomain.com +short
# Should return your Elastic IP
```

---

## Step 3 — Connect to the Server and Install Docker

```bash
# SSH into your new server
ssh -i ~/.ssh/inventory-app-key.pem ubuntu@<ELASTIC_IP>
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

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
  https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt-get update -y
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

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
ssh -i ~/.ssh/inventory-app-key.pem -N -L 8000:localhost:8000 ubuntu@<ELASTIC_IP>
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

The easiest way is to use the Supabase CLI locally:
```bash
# Install Supabase CLI if you haven't:
brew install supabase/tap/supabase

# Generate keys using your JWT_SECRET
supabase status  # Only works for linked projects
```

Alternatively, use [jwt.io](https://jwt.io) manually:
- **Anon key payload:** `{ "role": "anon", "iss": "supabase", "iat": 1700000000, "exp": 2000000000 }`
- **Service role key payload:** `{ "role": "service_role", "iss": "supabase", "iat": 1700000000, "exp": 2000000000 }`
- Algorithm: HS256, secret: your JWT_SECRET

Or use this one-liner script on your local machine:
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

# Your domain
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
ssh -i ~/.ssh/inventory-app-key.pem -N -L 5432:localhost:5432 ubuntu@<ELASTIC_IP>

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

Supabase Studio runs internally at port `5000` (or `3000` — check `docker ps` on the server). Access it only via SSH tunnel:

```bash
# Find the Studio port first:
ssh ubuntu@<ELASTIC_IP> "docker ps | grep studio"

# Open tunnel (adjust port if different from 5000):
ssh -i ~/.ssh/inventory-app-key.pem -N -L 54321:localhost:5000 ubuntu@<ELASTIC_IP>
```

Open `http://localhost:54321` — you're in Studio through the encrypted SSH tunnel. Log in with `DASHBOARD_USERNAME` / `DASHBOARD_PASSWORD`.

**Convenience alias** (add to `~/.zshrc` or `~/.bash_profile`):
```bash
alias studio-tunnel='ssh -i ~/.ssh/inventory-app-key.pem -N -L 54321:localhost:5000 ubuntu@<ELASTIC_IP>'
alias coolify-tunnel='ssh -i ~/.ssh/inventory-app-key.pem -N -L 8000:localhost:8000 ubuntu@<ELASTIC_IP>'
```

---

## Step 10 — Automated Database Backups

### 10.1 Create the Backup Script

On the server:
```bash
sudo nano /opt/backup-db.sh
```

```bash
#!/bin/bash
set -euo pipefail

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="/tmp/db_backup_${TIMESTAMP}.sql.gz"

# Find the Supabase DB container name
DB_CONTAINER=$(docker ps --format '{{.Names}}' | grep -E 'supabase.*db|db.*supabase' | head -1)

echo "[$(date)] Starting backup (container: $DB_CONTAINER)..."

docker exec "$DB_CONTAINER" pg_dump -U postgres postgres | gzip > "$BACKUP_FILE"

# Upload to S3 (requires aws CLI and appropriate IAM permissions or configured credentials)
# Replace BUCKET_NAME with your S3 bucket
aws s3 cp "$BACKUP_FILE" "s3://BUCKET_NAME/daily/db_backup_${TIMESTAMP}.sql.gz"

rm "$BACKUP_FILE"
echo "[$(date)] Backup uploaded to S3."
```

```bash
sudo chmod +x /opt/backup-db.sh
```

**S3 bucket:** Create one in the AWS Console (S3 → Create bucket). Either:
- Attach an IAM role to your EC2 instance (recommended — no credentials stored on disk), or
- Run `aws configure` on the server with an IAM user that has S3 write access

### 10.2 Schedule with Cron

```bash
sudo crontab -e

# Add this line — runs at 3:00 AM UTC daily:
0 3 * * * /opt/backup-db.sh >> /var/log/db-backup.log 2>&1
```

### 10.3 Test and Verify

```bash
# Test manually
sudo /opt/backup-db.sh

# Check it appeared in S3
aws s3 ls s3://BUCKET_NAME/daily/
```

### 10.4 Restore from Backup

```bash
# Download
aws s3 cp s3://BUCKET_NAME/daily/db_backup_<timestamp>.sql.gz /tmp/restore.sql.gz

# Restore
DB_CONTAINER=$(docker ps --format '{{.Names}}' | grep -E 'supabase.*db' | head -1)
gunzip -c /tmp/restore.sql.gz | docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres
```

---

## Step 11 — Deploying Updates

### App Updates (SvelteKit)

Push to GitHub. Then either:
- **Manually:** In Coolify → your SvelteKit resource → **Redeploy**
- **Automatically:** Enable **Auto Deploy** on the resource in Coolify (registers a GitHub webhook — zero-click deploys on every push)

### Database Migrations

```bash
# Open SSH tunnel to Postgres
ssh -i ~/.ssh/inventory-app-key.pem -N -L 5432:localhost:5432 ubuntu@<ELASTIC_IP> &

# Push migrations
supabase db push --db-url "postgresql://postgres:<PASSWORD>@localhost:5432/postgres"

# Close tunnel
kill %1
```

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

---

## Cost Estimate

| Resource | Monthly (us-west-2) |
|----------|---------------------|
| EC2 t3.medium | ~$34 |
| EBS 30 GB gp3 | ~$2.40 |
| Elastic IP | Free while attached |
| S3 backups (~5 GB) | ~$0.12 |
| Data transfer | ~$1–5 |
| **Total** | **~$38–42/month** |

> **Scaling:** If the server feels slow, upgrade the instance type in EC2 Console → Actions → Instance Settings → Change instance type (requires a brief stop/start).

---

## Quick Reference

```bash
# SSH into server
ssh -i ~/.ssh/inventory-app-key.pem ubuntu@<ELASTIC_IP>

# Open Coolify dashboard
ssh -i ~/.ssh/inventory-app-key.pem -N -L 8000:localhost:8000 ubuntu@<ELASTIC_IP>
# → http://localhost:8000

# Open Supabase Studio
ssh -i ~/.ssh/inventory-app-key.pem -N -L 54321:localhost:5000 ubuntu@<ELASTIC_IP>
# → http://localhost:54321

# Push database migrations
ssh -i ~/.ssh/inventory-app-key.pem -N -L 5432:localhost:5432 ubuntu@<ELASTIC_IP> &
supabase db push --db-url "postgresql://postgres:<PASSWORD>@localhost:5432/postgres"
kill %1

# Manual backup
ssh ubuntu@<ELASTIC_IP> sudo /opt/backup-db.sh

# View app logs (adjust container name as needed)
ssh ubuntu@<ELASTIC_IP> "docker logs -f \$(docker ps -q -f name=sveltekit)"

# Restart a container (e.g., after config change)
ssh ubuntu@<ELASTIC_IP> "docker restart \$(docker ps -q -f name=sveltekit)"
```

---

## Troubleshooting

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| Site shows 502 | SvelteKit container stopped | Check Coolify logs; click Redeploy |
| Supabase auth fails | `PUBLIC_SUPABASE_URL` wrong | Confirm `yourdomain.com/api` routes to Kong; check Supabase logs |
| Studio won't load | Tunnel not open or wrong port | Run `docker ps | grep studio` on server to find port |
| Migration push fails | SSH tunnel not active | Start the tunnel first, then push |
| Let's Encrypt SSL fails | DNS not propagated yet | Wait and retry; check `dig yourdomain.com` |
| Can't SSH anymore | Your IP changed | Update SSH inbound rule in AWS Security Group |
| "Permission denied" on Docker commands | User not in docker group | `sudo usermod -aG docker ubuntu && newgrp docker` |

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
variable "app_name"          { default = "inventory-app" }
variable "instance_type"     { default = "t3.medium" }
variable "key_pair_name"     { type = string }
variable "ssh_allowed_cidrs" { type = list(string); default = ["0.0.0.0/0"] }  # change to your IP
```

### Usage

```bash
cd infra/
terraform init
terraform plan -var="key_pair_name=inventory-app-key"
terraform apply -var="key_pair_name=inventory-app-key"
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
# Clone Supabase
git clone --depth 1 https://github.com/supabase/supabase
cd supabase/docker

# Copy and edit the env file
cp .env.example .env
nano .env  # Fill in POSTGRES_PASSWORD, JWT_SECRET, ANON_KEY, SERVICE_ROLE_KEY, etc.

# Start all services
podman-compose up -d
```

### Run SvelteKit with a Podman container

```bash
# Build image
podman build -t inventory-app .

# Run (adjust port as needed)
podman run -d \
  --name inventory-app \
  -p 3000:3000 \
  -e PUBLIC_SUPABASE_URL=... \
  -e PUBLIC_SUPABASE_ANON_KEY=... \
  -e ORIGIN=https://yourdomain.com \
  inventory-app
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

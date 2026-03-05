# CS Capstone Inventory Management System

## Development

Start supabase and the development server:

```sh
supabase start
bun run dev
```

Run checks:

```sh
bun run check
bun x ultracite fix
```

## Deployment

This supposes that the application is already deployed on AWS using Coolify.

### SSH into the EC2 instance

```sh
ssh -i ~/.ssh/capstone-inventory-key.pem ubuntu@ec2-52-39-13-214.us-west-2.compute.amazonaws.com
```

### Access Coolify via SSH Tunnel

```sh
ssh -i ~/.ssh/capstone-inventory-key.pem -N -L 8000:localhost:8000 ubuntu@ec2-52-39-13-214.us-west-2.compute.amazonaws.com
```

<!-- realtime ui is disabled because the right ports are not available with this setup -->

### Run Database Migrations

```sh
# Terminal 1: open tunnel
ssh -i ~/.ssh/capstone-inventory-key.pem -N -L 5432:localhost:5432 ubuntu@ec2-52-39-13-214.us-west-2.compute.amazonaws.com

# Terminal 2: push migrations (from your project root)
supabase db push --db-url "postgresql://postgres:<POSTGRES_PASSWORD>@localhost:5432/postgres"
```

### Access Supabase Studio

```bash
# Find the Studio port first:
ssh ubuntu@ec2-52-39-13-214.us-west-2.compute.amazonaws.com "docker ps | grep studio"

# Open tunnel (adjust port if different from 3000):
ssh -i ~/.ssh/capstone-inventory-key.pem -N -L 54321:localhost:3000 ubuntu@ec2-52-39-13-214.us-west-2.compute.amazonaws.com
```

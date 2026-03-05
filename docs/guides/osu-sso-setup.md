# Oregon State University ONID SSO Setup

This guide covers configuring SAML 2.0 Single Sign-On so users can log in with their OSU ONID credentials. The code is already in place — this guide covers the external registration and Supabase configuration steps required to activate it.

---

## Supabase Cloud vs. Self-Hosted

**If using Supabase Cloud:** SAML SSO requires the **Pro plan or higher**. It is not available on the free tier.

**If self-hosting Supabase:** SAML SSO is fully supported at no extra cost. The Pro plan restriction is a Supabase Cloud pricing limitation — it does not apply when you run Supabase yourself. Self-hosted Supabase runs the same auth service (GoTrue) which includes SAML 2.0.

The main difference: instead of configuring the SSO provider through the Supabase Studio dashboard UI, you enable and configure it via **environment variables** in your `docker-compose.yml` / Coolify environment editor. See [Step 3 — Self-Hosted Configuration](#step-3--configure-supabase-saml-provider) for the specific variables.

---

## Timing and Deployment Dependencies

This is a common source of confusion: **you do not need the app fully deployed to start the SSO registration process.**

Here is the dependency chain:

1. **Allocate an Elastic IP** — you get a static IP before any DNS or deployment
2. **Contact OSU IT (one email, two requests):**
   - Request a subdomain DNS record pointing to your Elastic IP (e.g., `inventory.oregonstate.edu → 54.x.x.x`)
   - Register your application for SAML SSO — you already know the ACS URL (see below)
3. **Deploy the app** — DNS can propagate while you do this
4. **Configure Supabase** with the IdP metadata OSU IT sends back
5. **Test SSO**

### Your ACS URL is predictable before deployment

For a **self-hosted** deployment, the SAML ACS URL follows this fixed pattern:

```
https://yourdomain.com/api/auth/v1/sso/saml/acs
```

Where `/api` is the path prefix that your Caddy/nginx reverse proxy forwards to the Supabase auth service. You can give this URL to OSU IT as soon as you know your domain — no need to wait for the app to be live.

Similarly, the **SP Entity ID** is:
```
https://yourdomain.com/api/auth/v1/sso/saml/metadata
```

### Why Supabase auth must be publicly accessible

During a SAML login, OSU's Shibboleth IdP **posts the SAML assertion directly to your server** — it doesn't go through the user's browser callback. This means:

```
User's browser → OSU Shibboleth IdP → POST to your ACS URL → your server
```

Your Supabase auth service (`/api/auth/...`) must accept connections from the public internet. If you restrict it to only your app server, OSU's IdP cannot reach the ACS endpoint and SSO will silently fail. The `/api` reverse-proxy path in your Caddy config is what makes this work.

> Your **database** and **Studio dashboard** can and should remain private. Only the `/api` auth path needs to be public.

---

## Prerequisites

| Requirement | Details |
|---|---|
| **Supabase plan** | Pro+ if using Supabase Cloud; any plan if self-hosting |
| **Your domain** | Needed to compute your ACS URL (Elastic IP → DNS → domain) |
| **Your app's callback URL** | `https://your-domain.com/auth/callback` |
| **Contact at OSU IT** | `identity@oregonstate.edu` or submit a ticket at `oregonstate.edu/helpcenter` |

---

## Architecture

```
User clicks "Sign in with Oregon State University"
  → browser calls supabase.auth.signInWithSSO({ domain: 'oregonstate.edu' })
  → Supabase redirects to OSU's Shibboleth IdP
  → User authenticates with ONID username + password (+ DUO MFA if required)
  → OSU IdP POSTs SAML assertion to: https://yourdomain.com/api/auth/v1/sso/saml/acs
  → Supabase validates the assertion, creates/updates auth.users entry
  → Supabase redirects to /auth/callback?code=...
  → SvelteKit callback route exchanges code for session
  → User is logged in; profile row is auto-created via database trigger
```

---

## Step 1 — Gather Your SP Information

Before contacting OSU IT, prepare these values. They are determined entirely by your domain — you don't need the app running.

**For self-hosted deployments** (replace `yourdomain.com` with your actual domain):

| Field | Value |
|---|---|
| **SP Entity ID** | `https://yourdomain.com/api/auth/v1/sso/saml/metadata` |
| **ACS URL** | `https://yourdomain.com/api/auth/v1/sso/saml/acs` |
| **App callback URL** | `https://yourdomain.com/auth/callback` |

**For Supabase Cloud deployments** (less common — replace with your project ref):

| Field | Value |
|---|---|
| **SP Entity ID** | `https://<project-ref>.supabase.co/auth/v1/sso/saml/metadata` |
| **ACS URL** | `https://<project-ref>.supabase.co/auth/v1/sso/saml/acs` |

---

## Step 2 — Contact OSU IT (One Email, Two Requests)

You can combine the DNS subdomain request and SSO registration into a single email. Example:

> **Subject:** DNS Record and SAML SSO Registration for Capstone Inventory App
>
> Hi,
>
> I am a student/instructor deploying a capstone project application. I need two things:
>
> **1. DNS Record**
> Please create a DNS A record:
> - Hostname: `inventory.oregonstate.edu` (or your preferred subdomain)
> - Points to: `54.x.x.x` (your Elastic IP)
>
> **2. SAML SSO Registration**
> Please register our application as a SAML Service Provider with these details:
> - Application name: CS Capstone Inventory Management
> - SP Entity ID: `https://inventory.oregonstate.edu/api/auth/v1/sso/saml/metadata`
> - ACS URL: `https://inventory.oregonstate.edu/api/auth/v1/sso/saml/acs`
> - Requested attributes: `email`, `givenName`, `sn`, and optionally `eduPersonAffiliation`
>
> Please provide the IdP metadata XML or metadata URL when the registration is complete.
>
> Thank you.

### Requested SAML Attributes

Ask OSU to release at minimum:
- `email` — `urn:oid:0.9.2342.19200300.100.1.3`
- `givenName` — `urn:oid:2.5.4.42`
- `sn` (surname) — `urn:oid:2.5.4.4`
- Optionally: `eduPersonAffiliation` — to distinguish students vs. employees for auto-role assignment

OSU IT will provide their **IdP metadata XML file** (or a metadata URL, typically `https://sso.oregonstate.edu/idp/shibboleth`). You need this for Step 3.

---

## Step 3 — Configure Supabase SAML Provider

### Option A: Supabase Cloud (Dashboard UI)

1. Go to **Supabase Dashboard → Authentication → SSO Providers**
2. Click **Add SSO Provider**
3. Choose **SAML 2.0**
4. Paste the **OSU IdP metadata XML** (or enter the metadata URL if OSU provides one)
5. Set the **Domain** to `oregonstate.edu`
6. Save — Supabase will generate a **Provider ID** (UUID)

### Option B: Self-Hosted Supabase (Environment Variables)

Add these environment variables to your GoTrue (auth) service in your `docker-compose.yml` or Coolify environment editor:

```env
# Enable SAML
GOTRUE_SAML_ENABLED=true

# Your app's external URL (must match what OSU IT registers as your ACS URL base)
API_EXTERNAL_URL=https://yourdomain.com/api

# OSU IdP metadata — provide either the URL or the raw XML:
GOTRUE_SAML_IDP_METADATA_URL=https://sso.oregonstate.edu/idp/shibboleth
# If OSU gives you XML instead of a URL:
# GOTRUE_SAML_IDP_METADATA_XML=<paste full XML here>
```

After adding these and restarting the auth service, register the SSO provider via the Supabase Management API (no dashboard UI for self-hosted):

```bash
# Get your service role key from your env vars, then:
curl -X POST "https://yourdomain.com/api/v1/admin/sso/providers" \
  -H "Authorization: Bearer <SERVICE_ROLE_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "saml",
    "metadata_url": "https://sso.oregonstate.edu/idp/shibboleth",
    "domains": ["oregonstate.edu"],
    "attribute_mapping": {
      "keys": {
        "email": { "name": "urn:oid:0.9.2342.19200300.100.1.3" },
        "full_name": { "name": "displayName" }
      }
    }
  }'
```

The response includes the **Provider ID** (UUID). To list existing providers:

```bash
curl "https://yourdomain.com/api/v1/admin/sso/providers" \
  -H "Authorization: Bearer <SERVICE_ROLE_KEY>"
```

---

## Step 4 — Code (already implemented)

The login page (`src/routes/login/+page.svelte`) already calls:

```typescript
const { data: ssoData, error: ssoErr } = await supabase.auth.signInWithSSO({
  domain: "oregonstate.edu",
  options: { redirectTo: `${window.location.origin}/auth/callback` },
});
```

And the callback route (`src/routes/auth/callback/+server.ts`) exchanges the code for a session:

```typescript
const { error } = await supabase.auth.exchangeCodeForSession(code);
```

If Supabase cannot resolve the domain automatically (check the Supabase auth logs), switch to using the provider ID:

```typescript
// In src/routes/login/+page.svelte, replace:
domain: "oregonstate.edu",
// with:
providerId: "your-provider-uuid-here",
```

---

## Step 5 — Profile Auto-Creation

The database already has a trigger (`handle_new_user`) that fires on every new `auth.users` insert, including SSO logins:

```sql
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name, role, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    'student',
    new.email
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(excluded.full_name, profiles.full_name);
  return new;
end;
$$ language plpgsql security definer;
```

OSU users who log in will get a `student` role by default. An admin must then go to **Manage Inventory → Users** to promote them to `instructor` or `admin`.

**Note on OSU affiliations:** If you want to auto-assign roles based on OSU affiliation (e.g., auto-assign `instructor` to employees), modify the trigger to read `new.raw_user_meta_data->>'eduPersonAffiliation'`:

```sql
case
  when new.raw_user_meta_data->>'eduPersonAffiliation' in ('faculty', 'staff', 'employee')
    then 'instructor'
  else 'student'
end
```

Ask OSU IT to release this attribute when you contact them in Step 2.

---

## Step 6 — Testing

1. Open an incognito window and go to `/login`
2. Click "Sign in with Oregon State University"
3. You should be redirected to `https://login.oregonstate.edu` (the OSU Shibboleth login page)
4. Log in with a valid ONID account
5. You should be redirected back and logged in
6. Check the Supabase Dashboard → Authentication → Users — you should see the new user with their `oregonstate.edu` email
7. Check the `profiles` table — a row should exist with `full_name` from OSU and `role = 'student'`

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Redirect loop on login | Metadata mismatch | Double-check the Entity ID and ACS URL match exactly what OSU IT registered |
| "SSO authentication failed" error | Code/state mismatch | Clear cookies, try again; check Supabase auth logs |
| OSU IdP cannot POST to ACS URL | Supabase auth not publicly reachable | Verify the `/api` reverse-proxy path is open in your Caddy config and security group |
| Profile not created | Trigger not firing | Verify the `on_auth_user_created` trigger exists with `\d auth.users` in psql |
| `full_name` is null | OSU not releasing givenName/sn | Request these attributes from OSU IT |
| Works in dev but not prod | `redirectTo` URL mismatch | Ensure `auth/callback` is in Supabase's allowed redirect URLs (Dashboard → Auth → URL Configuration) |

### Allowed Redirect URLs

In Supabase Dashboard → Authentication → URL Configuration (or via env var `GOTRUE_URI_ALLOW_LIST`), add:
```
https://your-domain.com/auth/callback
http://localhost:5173/auth/callback   ← for local development
```

---

## Security Notes

- Only `oregonstate.edu` email addresses will successfully authenticate via ONID SSO
- Password-based login remains available for non-OSU accounts (e.g., the initial admin account)
- Supabase validates the SAML assertion signature using OSU's public certificate — no credentials are stored by the app
- All new users start as `student` regardless of login method; role elevation is manual
- Your database port (5432) and Studio (port 54323) should remain firewalled; only ports 80/443 need to be public

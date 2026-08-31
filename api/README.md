# Doortronix client portal API

Cloudflare Worker + D1. The public site stays on GitHub Pages. This API holds logins, per-company discounts, orders, and Stripe.

Discount percentages never live in the quote page. The Worker applies them after sign-in.

## Local

```bash
cd api
npm install
cp .dev.vars.example .dev.vars
# Put your email in ADMIN_EMAILS so that account sees /portal/admin.html
npx wrangler d1 migrations apply doortronix-portal --local
npx wrangler dev --port 8788
```

Site: `python3 -m http.server 8765` from the repo root.  
Portal: http://127.0.0.1:8765/portal/signup.html  
API: http://127.0.0.1:8788

## Production

1. Cloudflare account. Create the D1 database:

```bash
npx wrangler d1 create doortronix-portal
```

2. Paste the `database_id` into `wrangler.jsonc`.
3. Apply migrations remotely:

```bash
npx wrangler d1 migrations apply doortronix-portal --remote
```

4. Secrets:

```bash
npx wrangler secret put ADMIN_BOOTSTRAP       # long random string; used once to promote your login
npx wrangler secret put STRIPE_SECRET_KEY
npx wrangler secret put STRIPE_WEBHOOK_SECRET
npx wrangler secret put PUBLIC_SITE_URL       # https://doortronixusa.com
```

Create your own portal login, then promote it:

```bash
npx wrangler d1 execute doortronix-portal --remote --command="UPDATE users SET is_admin=1 WHERE email='you@doortronixusa.com'"
```

Signing up with a factory email does **not** make someone an admin.

5. Deploy the Worker, then route `doortronixusa.com/api/*` to it (same origin as the site so `/api` works without CORS). Until that route exists, set `window.DTX_API` on portal pages to the `workers.dev` URL.

6. Stripe webhook URL: `https://doortronixusa.com/api/stripe/webhook`  
   Event: `checkout.session.completed`

## How you run it

- Anyone can create an account. They see published contractor net.
- In Admin → Companies, set their **Discount %**. Next quote shows their net.
- Confirm the dollar amount on every order before Stripe opens. The quote page total is an estimate only.
- They pay 50% deposit in Stripe → lead time starts → they pay the balance before ship.
- Duplicate on an old order reopens the quote builder with those doors.

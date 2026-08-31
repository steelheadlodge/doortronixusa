# Doortronix — project status & how to run it

_Last updated: 2026-08-31. Keep this current when big things change._

This file is the "pick up where we left off" note. It is internal notes, not a
customer-facing page.

---

## 1. Deploy safety — READ FIRST

- The **live site** is GitHub Pages, served from the **`main`** branch of
  `github.com/steelheadlodge/doortronixusa`.
- **Nothing goes live until `origin/main` is updated.**
- We work on local `main`; the off-machine backup is the **`staging`** branch
  (NOT live). A plain `git push` is intentionally rejected (branch names differ),
  so nothing deploys by accident — always use the explicit commands below.

### To back up work (safe, never live)
```bash
git add -A && git commit -m "…"
git push origin main:staging      # backup only, never touches the live site
```

### To publish to the LIVE site (only when we're ready)
```bash
git push origin main:main
```
Do this deliberately. It updates the public site within a minute or two.

---

## 2. What was built recently (committed on `staging`, not yet live)

- **Quote form now opens to a door-type chooser** ("Request a Quote" → Sliding
  vs Swing cards) instead of defaulting to sliders.
  - Product-page CTAs deep-link with `?type=slide` / `?type=swing` (they skip the
    chooser on purpose).
  - The chooser is hidden if you already have an in-progress cart in
    `localStorage`, are restoring a duplicate, or the URL has `?type=`/`?sheet=1`.
    If you don't see it: use a fresh/incognito window or run `localStorage.clear()`.
- **Swing door quoting**: single (RH/LH toggle), pair, and "Entry/Exit Swings"
  (twin, two packages + shared sidelite).
  - **Handing rule:** the user picks the handing (RH/LH); hinge side + swing
    direction are derived from it. Hinged left + swings in = LH inswing; hinged
    left + swings out = RH outswing; hinged right + swings in = RH inswing;
    hinged right + swings out = LH outswing. Labels read left-to-right only when
    two doors sit next to each other.
- **Transom verticals** selector (None–4) restored, with pricing + summary.
- **Slider muntin menu** with a config-aware default AFF (matches the old
  automatic position: centered below 8'0", 42" above).
- **Slider glass sizing rule**: equal top/bottom split up to 8' header; above 8'
  the bottom lite holds at the typical cut-sheet size and the top lite grows.
  Non-door frames (swing sidelites/transoms, twin center lite) use
  `glass = daylight opening + 5/8"`. Door-leaf glass and sliding-door transom
  glass are unchanged (transoms follow the formula spreadsheets).
- **Factory cut list** (first draft) on the confirmation sheet
  (`installer-cut-sheet.html`, "Factory cut list" button / `?cutlist=1`).
  **Needs production-manager review before trusting the numbers.**
- **Push-plate price line cleanup**: wireless TX/RX are itemized once, no longer
  duplicated in the plate description.
- **Customer portal** (`portal/`) + **API** (`api/`, Cloudflare Worker + D1).

---

## 3. Run everything locally

Two servers. Start both.

### API worker (accounts, orders, Stripe)
```bash
cd api
npm install                                              # first time only
cp .dev.vars.example .dev.vars                           # first time only
npx wrangler d1 migrations apply doortronix-portal --local
npx wrangler dev --port 8788                             # → http://127.0.0.1:8788
```

### Static site
```bash
# from repo root
python3 -m http.server 8765 --bind 127.0.0.1            # → http://127.0.0.1:8765
```

The portal auto-detects localhost and calls `http://127.0.0.1:8788/api`.

### Handy URLs (local)
- Quote form: http://127.0.0.1:8765/quote-combined.html
- Signup: http://127.0.0.1:8765/portal/signup.html
- Login: http://127.0.0.1:8765/portal/login.html
- Admin: http://127.0.0.1:8765/portal/admin.html (needs an admin flag — see below)

### Make yourself admin (local)
```bash
cd api
npx wrangler d1 execute doortronix-portal --local \
  --command="UPDATE users SET is_admin=1 WHERE email='you@doortronixusa.com'"
```
Signing up with a factory email does NOT auto-grant admin — it's a DB flag.

---

## 4. Account creation — verified working (2026-08-31, local)

Tested against the local worker:
- `POST /signup` → returns token + user (creates company + user). ✓
- `GET /me` with token → returns the user. ✓
- Duplicate email → 409. ✓
- `POST /login` → works. ✓
- Wrong password → 401. ✓

Not yet exercised: full browser signup → quote → submit order → admin confirm →
Stripe deposit. Stripe is not wired locally (no keys), so `/pay` returns a
"call us" 503 until `STRIPE_SECRET_KEY` is set.

---

## 5. Still to do / test

- [ ] Full browser walkthrough of signup + account creation UX.
- [ ] Submit an order from the quote builder into the portal, confirm in admin,
      run a Stripe test deposit (needs test keys in `.dev.vars`).
- [ ] Production-manager review of the factory cut list numbers/protocols.
- [ ] More random swing + slider config testing (handing labels, glass counts).
- [ ] Decide push/pull pull-handle option — see below.

---

## 6. Open decision: push/pull handles on OHC low-energy swings

Question: should low-energy (OHC) single/pair swing doors offer a selectable
pull handle (10" vs 12") that also shows on the drawing?

Context: low-energy operators are meant to also work as manual push/pull
("push-and-go"), so a graspable pull on the pull side is legitimate and common,
especially interior/vestibule entrances. Today the builder lists "Push/pull
hardware for manual use (incl.)" generically but doesn't let you pick a size or
draw it. Leaning toward: yes, add a selectable pull (default to the more common
size) and draw it on the pull side. Pending final decision.

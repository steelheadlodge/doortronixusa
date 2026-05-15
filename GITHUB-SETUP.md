# DoortronixUSA.com — GitHub Pages Setup

## Folder Structure

```
site/
├── index.html              ← Homepage
├── quote.html              ← Interactive Quote Form
├── why-us.html             ← Why Choose Doortronix
├── buy-american.html       ← Buy American / Texas Manufacturing
├── resources.html          ← Downloads & Specs
├── contact.html            ← Contact Page
├── contractor-account.html ← Contractor Account Application
├── css/
│   └── style.css           ← Shared stylesheet
├── js/
│   └── main.js             ← Mobile nav + accordion JS
├── images/                 ← Copy your photos here (see below)
│   ├── DOOR1.jpg
│   ├── DOOR2.jpg
│   ├── DOOR3.jpg
│   ├── DOOR4.jpg
│   ├── DOOR5.jpg
│   ├── DSC08260.JPG
│   ├── DSC08261.JPG
│   ├── DSC08262.JPG
│   ├── Doortronix bipart.jpg
│   └── SWING SINGLE.jpg
└── products/
    ├── revolution.html     ← Revolution Sliding Door
    ├── all-glass.html      ← All-Glass Sliding Door
    ├── hermetic.html       ← Hermetic / ICU Door
    └── swinging.html       ← Swinging Door
```

---

## Step 1 — Copy Images

Copy these photos from your Doortronix folder into `site/images/`:
- DOOR1.jpg through DOOR5.jpg
- DSC08260.JPG, DSC08261.JPG, DSC08262.JPG
- Doortronix bipart.jpg
- Doortronix bipart1.jpg
- SWING SINGLE.jpg
- FullSizeRender.jpg

The image names must match exactly (case-sensitive on GitHub).

---

## Step 2 — Set Up Formspree (Free — 50 submissions/month)

1. Go to https://formspree.io and create a free account
2. Create a new form — name it "DoortronixUSA Quote"
3. Copy your Form ID (looks like: `xknbqopv`)
4. In **quote.html**, find this line near the top:
   ```
   const FORMSPREE_ENDPOINT = "https://formspree.io/f/YOUR_FORM_ID";
   ```
   Replace `YOUR_FORM_ID` with your actual ID.

5. In **contact.html**, find:
   ```
   action="https://formspree.io/f/YOUR_FORM_ID"
   ```
   Replace both instances with your Form ID.

6. In **contractor-account.html**, same replacement.

You can use the same Form ID for all three, or create separate forms.

---

## Step 3 — Create GitHub Repository

1. Go to https://github.com and sign in
2. Click **New Repository**
3. Name it: `doortronixusa` (or `doortronixusa.com`)
4. Set to **Public**
5. Do NOT initialize with README (we have files already)
6. Click **Create Repository**

---

## Step 4 — Upload Files

**Option A — GitHub web uploader (easiest):**
1. On your new repo page, click **Add file → Upload files**
2. Drag the entire `site/` folder contents into the upload area
3. Commit changes

**Option B — GitHub Desktop (recommended for future updates):**
1. Download GitHub Desktop: https://desktop.github.com
2. Clone your new repo to your computer
3. Copy all files from `site/` into the cloned folder
4. In GitHub Desktop, commit and push

---

## Step 5 — Enable GitHub Pages

1. In your GitHub repo, click **Settings**
2. In the left sidebar, click **Pages**
3. Under Source, select **Deploy from a branch**
4. Select **main** branch and **/ (root)** folder
5. Click **Save**

Your site will be live at: `https://yourusername.github.io/doortronixusa/`

---

## Step 6 — Connect Custom Domain (DoortronixUSA.com)

### At your domain registrar (GoDaddy, Namecheap, etc.):

Add these DNS records:
```
A     @     185.199.108.153
A     @     185.199.109.153
A     @     185.199.110.153
A     @     185.199.111.153
CNAME www   yourusername.github.io
```

### Back in GitHub Pages Settings:
1. Under "Custom domain", enter: `doortronixusa.com`
2. Check "Enforce HTTPS"

DNS propagation takes 15 minutes to 48 hours.

---

## Step 7 — Add Cloudflare (Optional but Recommended)

Cloudflare gives you free CDN, DDoS protection, and analytics:
1. Go to https://cloudflare.com — create free account
2. Add your domain
3. Update your domain's nameservers to Cloudflare's nameservers
4. Set SSL/TLS to "Full"

---

## Updates — How to Edit the Site

**Small text edits:** GitHub.com → click the file → click the pencil icon → edit → commit

**Bigger updates:** Use GitHub Desktop — edit files locally, commit, push

---

## Phone Number / Email — Update in These Files

Current values: (903) 488-1810 | info@doortronixusa.com

These appear in the topbar, nav, footer, and contact page of every HTML file.
Find/replace with your preferred contact details before going live.

---

## Formspree Free Tier Limits

- 50 submissions per month
- Upgrade to Formspree Basic ($10/mo) for 1,000/month
- Alternative: EmailJS (free tier), Netlify Forms, or Basin

---

## Logo

Your current logos are BMP files (browsers don't support BMP).
Convert to PNG before adding to the site:
1. Open in Paint or Preview
2. Save As → PNG
3. Save to `site/images/logo.png`
4. Add `<img src="images/logo.png">` to the nav brand area in each HTML file

---

*Built with: HTML, CSS, vanilla JavaScript. No frameworks. No build step. Push and go.*

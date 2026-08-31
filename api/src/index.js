const SESSION_DAYS = 30;
const MAX_DISCOUNT = 80;
const MAX_DOORS_JSON = 400_000;

const ALLOWED_ORIGINS = [
  'https://doortronixusa.com',
  'https://www.doortronixusa.com',
  'http://localhost:8765',
  'http://127.0.0.1:8765',
  'http://localhost:8787',
  'http://127.0.0.1:8787',
  'http://localhost:8788',
  'http://127.0.0.1:8788',
  'http://localhost:8888',
  'http://127.0.0.1:8888',
];

export default {
  async fetch(request, env) {
    try {
      return await handle(request, env);
    } catch (err) {
      console.error(err);
      return json({ error: 'Server error' }, 500, request);
    }
  },
};

async function handle(request, env) {
  const url = new URL(request.url);
  if (request.method === 'OPTIONS') return cors(new Response(null, { status: 204 }), request);

  let path = url.pathname;
  if (path.startsWith('/api/')) path = path.slice(4);
  else if (path === '/api') path = '/';

  if (request.method === 'POST' && path === '/stripe/webhook') {
    return stripeWebhook(request, env);
  }

  if (request.method === 'GET' && path === '/health') {
    return json({ ok: true }, 200, request);
  }

  if (request.method === 'GET' && path === '/settings') {
    return json({ leadTime: await getSetting(env, 'lead_time'), note: await getSetting(env, 'public_note') }, 200, request);
  }

  if (request.method === 'POST' && path === '/signup') return signup(request, env);
  if (request.method === 'POST' && path === '/login') return login(request, env);
  if (request.method === 'POST' && path === '/logout') return logout(request, env);
  if (request.method === 'POST' && path === '/admin/bootstrap') return bootstrapAdmin(request, env);

  const session = await getSession(request, env);

  if (request.method === 'GET' && path === '/me') {
    if (!session) return json({ error: 'Not signed in' }, 401, request);
    return json({ user: publicUser(session) }, 200, request);
  }

  if (request.method === 'PATCH' && path === '/me') {
    if (!session) return json({ error: 'Not signed in' }, 401, request);
    return updateMe(request, env, session);
  }

  if (path === '/orders' && request.method === 'GET') {
    if (!session) return json({ error: 'Not signed in' }, 401, request);
    return listOrders(env, session, request);
  }
  if (path === '/orders' && request.method === 'POST') {
    if (!session) return json({ error: 'Not signed in' }, 401, request);
    return createOrder(request, env, session);
  }

  const orderMatch = path.match(/^\/orders\/(\d+)$/);
  if (orderMatch && request.method === 'GET') {
    if (!session) return json({ error: 'Not signed in' }, 401, request);
    return getOrder(env, session, Number(orderMatch[1]), request);
  }

  const dupMatch = path.match(/^\/orders\/(\d+)\/duplicate$/);
  if (dupMatch && request.method === 'POST') {
    if (!session) return json({ error: 'Not signed in' }, 401, request);
    return duplicateOrder(env, session, Number(dupMatch[1]), request);
  }

  const payMatch = path.match(/^\/orders\/(\d+)\/pay$/);
  if (payMatch && request.method === 'POST') {
    if (!session) return json({ error: 'Not signed in' }, 401, request);
    return startPay(request, env, session, Number(payMatch[1]));
  }

  if (path === '/drafts' && request.method === 'GET') {
    if (!session) return json({ error: 'Not signed in' }, 401, request);
    return listDrafts(env, session, request);
  }
  if (path === '/drafts' && request.method === 'POST') {
    if (!session) return json({ error: 'Not signed in' }, 401, request);
    return createDraft(request, env, session);
  }
  const draftMatch = path.match(/^\/drafts\/(\d+)$/);
  if (draftMatch && request.method === 'GET') {
    if (!session) return json({ error: 'Not signed in' }, 401, request);
    return getDraft(env, session, Number(draftMatch[1]), request);
  }
  if (draftMatch && (request.method === 'PATCH' || request.method === 'PUT')) {
    if (!session) return json({ error: 'Not signed in' }, 401, request);
    return updateDraft(request, env, session, Number(draftMatch[1]));
  }
  if (draftMatch && request.method === 'DELETE') {
    if (!session) return json({ error: 'Not signed in' }, 401, request);
    return deleteDraft(env, session, Number(draftMatch[1]), request);
  }

  if (path.startsWith('/admin')) {
    if (!session) return json({ error: 'Not signed in' }, 401, request);
    if (!session.isAdmin) return json({ error: 'Admin only' }, 403, request);
    return adminRoutes(path, request, env, session);
  }

  return json({ error: 'Not found' }, 404, request);
}

async function adminRoutes(path, request, env, session) {
  if (path === '/admin/companies' && request.method === 'GET') {
    const { results } = await env.DB.prepare(
      `SELECT c.*, (SELECT COUNT(*) FROM users u WHERE u.company_id = c.id) AS user_count,
              (SELECT COUNT(*) FROM orders o WHERE o.company_id = c.id) AS order_count
       FROM companies c ORDER BY c.name COLLATE NOCASE`
    ).all();
    return json({ companies: results }, 200, request);
  }

  const coMatch = path.match(/^\/admin\/companies\/(\d+)$/);
  if (coMatch && request.method === 'PATCH') {
    const body = await readJson(request);
    const id = Number(coMatch[1]);
    const discount = clampDiscount(body.discountPct);
    const deposit = clampNum(body.depositPct, 10, 100, 50);
    const selfServe = body.selfServe ? 1 : 0;
    const notes = String(body.notes || '').slice(0, 2000);
    await env.DB.prepare(
      'UPDATE companies SET discount_pct = ?, deposit_pct = ?, self_serve = ?, notes = ? WHERE id = ?'
    ).bind(discount, deposit, selfServe, notes, id).run();
    const row = await env.DB.prepare('SELECT * FROM companies WHERE id = ?').bind(id).first();
    return json({ company: row }, 200, request);
  }

  if (path === '/admin/orders' && request.method === 'GET') {
    const { results } = await env.DB.prepare(
      `SELECT o.id, o.number, o.status, o.project_name, o.your_total, o.confirmed_total,
              o.deposit_paid, o.balance_paid, o.created_at, o.lead_starts_at, o.ship_estimate,
              c.name AS company_name, u.email AS user_email
       FROM orders o
       JOIN companies c ON c.id = o.company_id
       JOIN users u ON u.id = o.user_id
       ORDER BY o.id DESC LIMIT 200`
    ).all();
    return json({ orders: results }, 200, request);
  }

  const aoMatch = path.match(/^\/admin\/orders\/(\d+)$/);
  if (aoMatch && request.method === 'GET') {
    const order = await env.DB.prepare(
      `SELECT o.*, c.name AS company_name, c.discount_pct, u.email AS user_email
       FROM orders o JOIN companies c ON c.id = o.company_id JOIN users u ON u.id = o.user_id
       WHERE o.id = ?`
    ).bind(Number(aoMatch[1])).first();
    if (!order) return json({ error: 'Not found' }, 404, request);
    return json({ order: formatOrder(order, true) }, 200, request);
  }
  if (aoMatch && request.method === 'PATCH') {
    return adminPatchOrder(request, env, Number(aoMatch[1]));
  }

  if (path === '/admin/settings' && request.method === 'PATCH') {
    const body = await readJson(request);
    if (body.leadTime) await setSetting(env, 'lead_time', String(body.leadTime).slice(0, 300));
    if (body.note) await setSetting(env, 'public_note', String(body.note).slice(0, 500));
    return json({ leadTime: await getSetting(env, 'lead_time'), note: await getSetting(env, 'public_note') }, 200, request);
  }

  return json({ error: 'Not found' }, 404, request);
}

async function signup(request, env) {
  if (!(await rateOk(env, request, 'signup', 8, 3600))) {
    return json({ error: 'Too many signups from this network. Try again later.' }, 429, request);
  }
  const body = await readJson(request);
  const email = normalizeEmail(body.email);
  const password = String(body.password || '');
  const name = String(body.name || '').trim();
  const companyName = String(body.company || '').trim();
  const phone = String(body.phone || '').trim().slice(0, 40);
  if (!email || !email.includes('@')) return json({ error: 'Enter a valid email.' }, 400, request);
  if (password.length < 8 || password.length > 200) return json({ error: 'Password must be 8–200 characters.' }, 400, request);
  if (name.length < 2) return json({ error: 'Enter your name.' }, 400, request);
  if (companyName.length < 2) return json({ error: 'Enter your company name.' }, 400, request);

  const existing = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
  if (existing) return json({ error: 'An account with that email already exists. Sign in instead.' }, 409, request);

  const hash = await hashPassword(password);
  const co = await env.DB.prepare(
    'INSERT INTO companies (name) VALUES (?) RETURNING id'
  ).bind(companyName.slice(0, 120)).first();

  const user = await env.DB.prepare(
    'INSERT INTO users (company_id, email, password_hash, name, phone) VALUES (?, ?, ?, ?, ?) RETURNING id, company_id, email, name, phone'
  ).bind(co.id, email, hash, name.slice(0, 80), phone).first();

  const token = await createSession(env, user.id);
  const session = await loadSessionUser(env, user.id);
  return json({ token, user: publicUser(session) }, 201, request);
}

async function login(request, env) {
  if (!(await rateOk(env, request, 'login', 20, 900))) {
    return json({ error: 'Too many sign-in attempts. Try again later.' }, 429, request);
  }
  const body = await readJson(request);
  const email = normalizeEmail(body.email);
  const password = String(body.password || '');
  const user = await env.DB.prepare(
    'SELECT id, password_hash FROM users WHERE email = ?'
  ).bind(email).first();
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    return json({ error: 'Email or password is incorrect.' }, 401, request);
  }
  const token = await createSession(env, user.id);
  const session = await loadSessionUser(env, user.id);
  return json({ token, user: publicUser(session) }, 200, request);
}

async function logout(request, env) {
  const token = bearerToken(request);
  if (token) await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
  return json({ ok: true }, 200, request);
}

async function updateMe(request, env, session) {
  const body = await readJson(request);
  const name = String(body.name || session.name).trim().slice(0, 80);
  const phone = String(body.phone || '').trim().slice(0, 40);
  await env.DB.prepare('UPDATE users SET name = ?, phone = ? WHERE id = ?').bind(name, phone, session.id).run();
  if (body.company && String(body.company).trim().length >= 2) {
    await env.DB.prepare('UPDATE companies SET name = ? WHERE id = ?')
      .bind(String(body.company).trim().slice(0, 120), session.companyId).run();
  }
  const fresh = await loadSessionUser(env, session.id);
  return json({ user: publicUser(fresh) }, 200, request);
}

async function listOrders(env, session, request) {
  const { results } = await env.DB.prepare(
    `SELECT id, number, status, project_name, location, your_total, confirmed_total,
            deposit_paid, balance_paid, lead_time_text, lead_starts_at, ship_estimate, created_at
     FROM orders WHERE company_id = ? ORDER BY id DESC LIMIT 100`
  ).bind(session.companyId).all();
  return json({ orders: results }, 200, request);
}

async function getOrder(env, session, id, request) {
  const order = await env.DB.prepare('SELECT * FROM orders WHERE id = ? AND company_id = ?')
    .bind(id, session.companyId).first();
  if (!order) return json({ error: 'Not found' }, 404, request);
  return json({ order: formatOrder(order, false) }, 200, request);
}

async function createOrder(request, env, session) {
  const body = await readJson(request);
  const doors = Array.isArray(body.doors) ? body.doors : [];
  if (!doors.length) return json({ error: 'Add at least one door.' }, 400, request);
  const doorsJson = JSON.stringify(doors);
  if (doorsJson.length > MAX_DOORS_JSON) return json({ error: 'Order is too large.' }, 400, request);

  const listTotal = Number(body.listTotal);
  if (!Number.isFinite(listTotal) || listTotal < 0) return json({ error: 'Missing estimate total.' }, 400, request);

  const yourTotal = applyDiscount(listTotal, session.discountPct);
  const leadTime = await getSetting(env, 'lead_time');
  // Client listTotal is an estimate only. Never auto-confirm — that would let
  // anyone pay a price they typed. Factory confirms before Stripe opens.
  const year = new Date().getUTCFullYear();
  let row = null;
  for (let attempt = 0; attempt < 5 && !row; attempt++) {
    const seq = await env.DB.prepare(
      `SELECT COALESCE(MAX(id), 0) + 1 AS n FROM orders`
    ).first();
    const number = 'DTX-' + year + '-' + String((seq?.n || 1) + attempt).padStart(4, '0');
    try {
      row = await env.DB.prepare(
        `INSERT INTO orders (
           number, company_id, user_id, status, project_name, location, po_number, ship_date_wanted,
           contact_name, contact_email, contact_phone, doors_json, list_total, your_total,
           confirmed_total, deposit_amount, lead_time_text
         ) VALUES (?, ?, ?, 'submitted', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?)
         RETURNING id, number, status`
      ).bind(
        number,
        session.companyId,
        session.id,
        String(body.projectName || '').slice(0, 160),
        String(body.location || '').slice(0, 160),
        String(body.poNumber || '').slice(0, 80),
        String(body.shipDate || '').slice(0, 40),
        String(body.name || session.name).slice(0, 80),
        normalizeEmail(body.email || session.email),
        String(body.phone || session.phone || '').slice(0, 40),
        doorsJson,
        money(listTotal),
        yourTotal,
        leadTime
      ).first();
    } catch (err) {
      if (!String(err.message || err).includes('UNIQUE')) throw err;
    }
  }
  if (!row) return json({ error: 'Could not create order number. Try again.' }, 500, request);

  return json({ order: { id: row.id, number: row.number, status: row.status, yourTotal, confirmedTotal: null } }, 201, request);
}

async function duplicateOrder(env, session, id, request) {
  const src = await env.DB.prepare('SELECT * FROM orders WHERE id = ? AND company_id = ?')
    .bind(id, session.companyId).first();
  if (!src) return json({ error: 'Not found' }, 404, request);
  const doors = JSON.parse(src.doors_json || '[]');
  return json({
    restore: {
      sourceNumber: src.number,
      projectName: (src.project_name || '') + (src.project_name ? ' (copy)' : ''),
      location: src.location,
      name: src.contact_name,
      email: src.contact_email,
      phone: src.contact_phone,
      doors,
    },
  }, 200, request);
}

const MAX_DRAFTS = 100;

function draftHeaderFields(body) {
  return {
    title: String(body.title || body.projectName || '').slice(0, 160),
    projectName: String(body.projectName || '').slice(0, 160),
    location: String(body.location || '').slice(0, 160),
    poNumber: String(body.poNumber || '').slice(0, 80),
    shipDate: String(body.shipDate || '').slice(0, 40),
    shipTo: String(body.shipTo || '').slice(0, 400),
    name: String(body.name || '').slice(0, 80),
    email: normalizeEmail(body.email || ''),
    phone: String(body.phone || '').slice(0, 40),
  };
}

function formatDraft(row, includeDoors) {
  const out = {
    id: row.id,
    title: row.title,
    projectName: row.project_name,
    location: row.location,
    poNumber: row.po_number,
    shipDate: row.ship_date,
    shipTo: row.ship_to,
    name: row.contact_name,
    email: row.contact_email,
    phone: row.contact_phone,
    listTotal: row.list_total,
    doorCount: row.door_count != null ? row.door_count : undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  if (includeDoors) {
    try { out.doors = JSON.parse(row.doors_json || '[]'); } catch { out.doors = []; }
  }
  return out;
}

async function listDrafts(env, session, request) {
  const { results } = await env.DB.prepare(
    `SELECT id, title, project_name, location, po_number, list_total, created_at, updated_at,
            (SELECT COUNT(*) FROM json_each(doors_json)) AS door_count
     FROM drafts WHERE company_id = ? ORDER BY updated_at DESC, id DESC LIMIT 100`
  ).bind(session.companyId).all();
  return json({ drafts: (results || []).map((r) => formatDraft(r, false)) }, 200, request);
}

async function getDraft(env, session, id, request) {
  const row = await env.DB.prepare('SELECT * FROM drafts WHERE id = ? AND company_id = ?')
    .bind(id, session.companyId).first();
  if (!row) return json({ error: 'Not found' }, 404, request);
  return json({ draft: formatDraft(row, true) }, 200, request);
}

async function createDraft(request, env, session) {
  const body = await readJson(request);
  const doors = Array.isArray(body.doors) ? body.doors : [];
  if (!doors.length) return json({ error: 'Add at least one door before saving.' }, 400, request);
  const doorsJson = JSON.stringify(doors);
  if (doorsJson.length > MAX_DOORS_JSON) return json({ error: 'Quote is too large to save.' }, 400, request);

  const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM drafts WHERE company_id = ?')
    .bind(session.companyId).first();
  if ((count?.n || 0) >= MAX_DRAFTS) {
    return json({ error: 'You have reached the saved-quote limit. Delete a few and try again.' }, 409, request);
  }

  const h = draftHeaderFields(body);
  const listTotal = Number(body.listTotal);
  const row = await env.DB.prepare(
    `INSERT INTO drafts (
       company_id, user_id, title, project_name, location, po_number, ship_date, ship_to,
       contact_name, contact_email, contact_phone, doors_json, list_total
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     RETURNING id, title, project_name, updated_at`
  ).bind(
    session.companyId, session.id, h.title, h.projectName, h.location, h.poNumber,
    h.shipDate, h.shipTo, h.name, h.email, h.phone, doorsJson,
    Number.isFinite(listTotal) ? money(listTotal) : null
  ).first();
  return json({ draft: { id: row.id, title: row.title, projectName: row.project_name, updatedAt: row.updated_at } }, 201, request);
}

async function updateDraft(request, env, session, id) {
  const existing = await env.DB.prepare('SELECT id FROM drafts WHERE id = ? AND company_id = ?')
    .bind(id, session.companyId).first();
  if (!existing) return json({ error: 'Not found' }, 404, request);
  const body = await readJson(request);
  const doors = Array.isArray(body.doors) ? body.doors : [];
  if (!doors.length) return json({ error: 'Add at least one door before saving.' }, 400, request);
  const doorsJson = JSON.stringify(doors);
  if (doorsJson.length > MAX_DOORS_JSON) return json({ error: 'Quote is too large to save.' }, 400, request);

  const h = draftHeaderFields(body);
  const listTotal = Number(body.listTotal);
  await env.DB.prepare(
    `UPDATE drafts SET title = ?, project_name = ?, location = ?, po_number = ?, ship_date = ?,
            ship_to = ?, contact_name = ?, contact_email = ?, contact_phone = ?,
            doors_json = ?, list_total = ?, updated_at = datetime('now')
     WHERE id = ? AND company_id = ?`
  ).bind(
    h.title, h.projectName, h.location, h.poNumber, h.shipDate, h.shipTo,
    h.name, h.email, h.phone, doorsJson,
    Number.isFinite(listTotal) ? money(listTotal) : null, id, session.companyId
  ).run();
  const row = await env.DB.prepare('SELECT id, title, project_name, updated_at FROM drafts WHERE id = ?').bind(id).first();
  return json({ draft: { id: row.id, title: row.title, projectName: row.project_name, updatedAt: row.updated_at } }, 200, request);
}

async function deleteDraft(env, session, id, request) {
  const res = await env.DB.prepare('DELETE FROM drafts WHERE id = ? AND company_id = ?')
    .bind(id, session.companyId).run();
  if (!res.meta?.changes) return json({ error: 'Not found' }, 404, request);
  return json({ ok: true }, 200, request);
}

async function startPay(request, env, session, id) {
  if (!(await rateOk(env, request, 'pay', 8, 600))) {
    return json({ error: 'Too many payment attempts. Wait a few minutes or call (888) 453-5196.' }, 429, request);
  }
  const body = await readJson(request);
  const kind = body.kind === 'balance' ? 'balance' : 'deposit';
  const order = await env.DB.prepare('SELECT * FROM orders WHERE id = ? AND company_id = ?')
    .bind(id, session.companyId).first();
  if (!order) return json({ error: 'Not found' }, 404, request);
  if (order.confirmed_total == null) {
    return json({ error: 'Doortronix still needs to confirm this price before you can pay online.' }, 409, request);
  }
  if (kind === 'deposit' && order.deposit_paid) return json({ error: 'Deposit is already paid.' }, 409, request);
  if (kind === 'balance' && order.balance_paid) return json({ error: 'Balance is already paid.' }, 409, request);
  if (kind === 'balance' && !order.deposit_paid) return json({ error: 'Deposit must be paid first.' }, 409, request);

  const amount = kind === 'deposit'
    ? money(order.deposit_amount || order.confirmed_total * ((session.depositPct || 50) / 100))
    : money(order.confirmed_total - (order.deposit_amount || 0));

  if (amount <= 0) return json({ error: 'Nothing due.' }, 409, request);
  if (!env.STRIPE_SECRET_KEY) {
    return json({
      error: 'Card payments are not live yet. Call (888) 453-5196 to pay.',
      amount,
      kind,
    }, 503, request);
  }

  const pending = await env.DB.prepare(
    `SELECT * FROM payments WHERE order_id = ? AND kind = ? AND status = 'pending' ORDER BY id DESC LIMIT 1`
  ).bind(order.id, kind).first();
  if (pending?.stripe_session_id) {
    const existing = await stripeGet(env, '/v1/checkout/sessions/' + pending.stripe_session_id);
    if (existing && existing.status === 'open' && existing.url) {
      return json({ url: existing.url, amount, kind }, 200, request);
    }
  }

  const site = (env.PUBLIC_SITE_URL || 'https://doortronixusa.com').replace(/\/$/, '');
  const success = site + '/portal/pay-return.html?order=' + order.id + '&kind=' + kind;
  const cancel = site + '/portal/order.html?id=' + order.id;

  const params = new URLSearchParams();
  params.set('mode', 'payment');
  params.set('success_url', success + '&session_id={CHECKOUT_SESSION_ID}');
  params.set('cancel_url', cancel);
  params.set('client_reference_id', String(order.id));
  params.set('customer_email', order.contact_email || session.email);
  params.set('metadata[order_id]', String(order.id));
  params.set('metadata[kind]', kind);
  params.set('metadata[payment_id]', pending ? String(pending.id) : '');
  params.set('line_items[0][quantity]', '1');
  params.set('line_items[0][price_data][currency]', 'usd');
  params.set('line_items[0][price_data][unit_amount]', String(Math.round(amount * 100)));
  params.set('line_items[0][price_data][product_data][name]',
    (kind === 'deposit' ? 'Deposit — ' : 'Balance — ') + order.number);

  const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + env.STRIPE_SECRET_KEY,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params,
  });
  const data = await res.json();
  if (!res.ok) {
    console.error('Stripe session error', data);
    return json({ error: 'Could not start checkout. Call (888) 453-5196.' }, 502, request);
  }

  if (pending) {
    await env.DB.prepare(
      `UPDATE payments SET stripe_session_id = ?, amount = ?, status = 'pending' WHERE id = ?`
    ).bind(data.id, amount, pending.id).run();
  } else {
    await env.DB.prepare(
      'INSERT INTO payments (order_id, kind, amount, stripe_session_id, status) VALUES (?, ?, ?, ?, ?)'
    ).bind(order.id, kind, amount, data.id, 'pending').run();
  }
  await env.DB.prepare('UPDATE orders SET stripe_session_id = ?, updated_at = datetime(\'now\') WHERE id = ?')
    .bind(data.id, order.id).run();

  return json({ url: data.url, amount, kind }, 200, request);
}

async function stripeWebhook(request, env) {
  if (!env.STRIPE_WEBHOOK_SECRET) return json({ error: 'Webhook not configured' }, 500, request);
  const raw = await request.text();
  const sig = request.headers.get('stripe-signature') || '';
  if (!(await verifyStripeSig(raw, sig, env.STRIPE_WEBHOOK_SECRET))) {
    return json({ error: 'Bad signature' }, 400, request);
  }
  const event = JSON.parse(raw);
  if (event.id) {
    try {
      await env.DB.prepare('INSERT INTO processed_events (id) VALUES (?)').bind(event.id).run();
    } catch {
      return json({ ok: true, duplicate: true }, 200, request);
    }
  }
  if (event.type !== 'checkout.session.completed') return json({ ok: true }, 200, request);

  const session = event.data?.object || {};
  if (session.payment_status !== 'paid' || session.mode !== 'payment' || session.currency !== 'usd') {
    return json({ ok: true, ignored: true }, 200, request);
  }

  const pay = await env.DB.prepare('SELECT * FROM payments WHERE stripe_session_id = ?')
    .bind(session.id).first();
  if (!pay) return json({ error: 'Unknown checkout session' }, 400, request);
  if (pay.status === 'paid') return json({ ok: true }, 200, request);

  const expected = Math.round(Number(pay.amount) * 100);
  if (session.amount_total !== expected) {
    return json({ error: 'Amount mismatch' }, 400, request);
  }

  const marked = await env.DB.prepare(
    `UPDATE payments SET status = 'paid', stripe_payment_intent = ?, stripe_event_id = ?
     WHERE id = ? AND status = 'pending'`
  ).bind(session.payment_intent || '', event.id || null, pay.id).run();
  if (!marked.meta?.changes) return json({ ok: true }, 200, request);

  const order = await env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(pay.order_id).first();
  if (!order) return json({ ok: true }, 200, request);

  if (pay.kind === 'deposit' && !order.deposit_paid) {
    const lead = order.lead_time_text || await getSetting(env, 'lead_time');
    const start = new Date().toISOString().slice(0, 10);
    await env.DB.prepare(
      `UPDATE orders SET deposit_paid = 1, status = 'deposit_paid', lead_starts_at = ?,
              lead_time_text = ?, updated_at = datetime('now')
       WHERE id = ? AND deposit_paid = 0`
    ).bind(start, lead, pay.order_id).run();
  } else if (pay.kind === 'balance' && !order.balance_paid) {
    await env.DB.prepare(
      `UPDATE orders SET balance_paid = 1, updated_at = datetime('now') WHERE id = ? AND balance_paid = 0`
    ).bind(pay.order_id).run();
  }

  return json({ ok: true }, 200, request);
}

async function adminPatchOrder(request, env, id) {
  const body = await readJson(request);
  const order = await env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(id).first();
  if (!order) return json({ error: 'Not found' }, 404, request);

  let confirmed = order.confirmed_total;
  if (body.confirmedTotal != null) {
    confirmed = money(body.confirmedTotal);
    if (confirmed <= 0) return json({ error: 'Confirmed total must be greater than 0.' }, 400, request);
  }
  const company = await env.DB.prepare('SELECT deposit_pct FROM companies WHERE id = ?')
    .bind(order.company_id).first();
  const depositPct = clampNum(body.depositPct, 10, 100, company?.deposit_pct || 50);
  const depositAmount = confirmed != null ? money(confirmed * depositPct / 100) : order.deposit_amount;

  const allowed = ['submitted', 'confirmed', 'deposit_paid', 'in_production', 'ready_to_ship', 'shipped', 'cancelled'];
  const status = allowed.includes(body.status) ? body.status : (confirmed != null && order.status === 'submitted' ? 'confirmed' : order.status);
  const depositPaid = ['deposit_paid', 'in_production', 'ready_to_ship', 'shipped'].includes(status) ? 1 : (status === 'submitted' || status === 'confirmed' ? 0 : order.deposit_paid);
  const balancePaid = status === 'shipped' ? 1 : (['submitted', 'confirmed', 'deposit_paid', 'in_production'].includes(status) ? 0 : order.balance_paid);

  await env.DB.prepare(
    `UPDATE orders SET
       confirmed_total = ?, deposit_amount = ?, status = ?,
       deposit_paid = ?, balance_paid = ?,
       lead_time_text = COALESCE(?, lead_time_text),
       ship_estimate = COALESCE(?, ship_estimate),
       notes = COALESCE(?, notes),
       updated_at = datetime('now')
     WHERE id = ?`
  ).bind(
    confirmed,
    depositAmount,
    status,
    depositPaid,
    balancePaid,
    body.leadTime != null ? String(body.leadTime).slice(0, 300) : null,
    body.shipEstimate != null ? String(body.shipEstimate).slice(0, 40) : null,
    body.notes != null ? String(body.notes).slice(0, 2000) : null,
    id
  ).run();

  const fresh = await env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(id).first();
  return json({ order: formatOrder(fresh, true) }, 200, request);
}

function formatOrder(order, includeAdmin) {
  let doors = [];
  try { doors = JSON.parse(order.doors_json || '[]'); } catch { doors = []; }
  const out = {
    id: order.id,
    number: order.number,
    status: order.status,
    projectName: order.project_name,
    location: order.location,
    poNumber: order.po_number,
    shipDateWanted: order.ship_date_wanted,
    contactName: order.contact_name,
    contactEmail: order.contact_email,
    contactPhone: order.contact_phone,
    doors,
    listTotal: order.list_total,
    yourTotal: order.your_total,
    confirmedTotal: order.confirmed_total,
    depositAmount: order.deposit_amount,
    depositPaid: !!order.deposit_paid,
    balancePaid: !!order.balance_paid,
    leadTime: order.lead_time_text,
    leadStartsAt: order.lead_starts_at,
    shipEstimate: order.ship_estimate,
    createdAt: order.created_at,
    updatedAt: order.updated_at,
  };
  if (includeAdmin) {
    out.companyName = order.company_name;
    out.userEmail = order.user_email;
    out.notes = order.notes;
    out.discountPct = order.discount_pct;
  }
  return out;
}

function publicUser(s) {
  return {
    id: s.id,
    email: s.email,
    name: s.name,
    phone: s.phone || '',
    company: s.companyName,
    companyId: s.companyId,
    discountPct: s.discountPct,
    depositPct: s.depositPct,
    selfServe: !!s.selfServe,
    isAdmin: !!s.isAdmin,
    multiplier: 1 - (s.discountPct || 0) / 100,
  };
}

async function getSession(request, env) {
  const token = bearerToken(request);
  if (!token) return null;
  const row = await env.DB.prepare(
    `SELECT s.expires_at, u.id, u.email, u.name, u.phone, u.company_id, u.is_admin,
            c.name AS company_name, c.discount_pct, c.deposit_pct, c.self_serve
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     JOIN companies c ON c.id = u.company_id
     WHERE s.token = ?`
  ).bind(token).first();
  if (!row) return null;
  if (row.expires_at < Date.now()) {
    await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
    return null;
  }
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    phone: row.phone,
    companyId: row.company_id,
    companyName: row.company_name,
    discountPct: row.discount_pct,
    depositPct: row.deposit_pct,
    selfServe: row.self_serve,
    isAdmin: !!row.is_admin,
  };
}

async function loadSessionUser(env, userId) {
  const row = await env.DB.prepare(
    `SELECT u.id, u.email, u.name, u.phone, u.company_id, u.is_admin,
            c.name AS company_name, c.discount_pct, c.deposit_pct, c.self_serve
     FROM users u JOIN companies c ON c.id = u.company_id WHERE u.id = ?`
  ).bind(userId).first();
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    phone: row.phone,
    companyId: row.company_id,
    companyName: row.company_name,
    discountPct: row.discount_pct,
    depositPct: row.deposit_pct,
    selfServe: row.self_serve,
    isAdmin: !!row.is_admin,
  };
}

async function bootstrapAdmin(request, env) {
  if (!(await rateOk(env, request, 'bootstrap', 5, 3600))) {
    return json({ error: 'Too many attempts.' }, 429, request);
  }
  const expected = String(env.ADMIN_BOOTSTRAP || '');
  if (expected.length < 16) return json({ error: 'Admin bootstrap is not configured.' }, 503, request);
  const body = await readJson(request);
  if (String(body.secret || '') !== expected) return json({ error: 'Wrong bootstrap secret.' }, 403, request);
  const email = normalizeEmail(body.email);
  const user = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
  if (!user) return json({ error: 'Create that login first, then bootstrap it.' }, 404, request);
  await env.DB.prepare('UPDATE users SET is_admin = 1 WHERE id = ?').bind(user.id).run();
  return json({ ok: true, email }, 200, request);
}

async function stripeGet(env, path) {
  const res = await fetch('https://api.stripe.com' + path, {
    headers: { Authorization: 'Bearer ' + env.STRIPE_SECRET_KEY },
  });
  if (!res.ok) return null;
  return res.json();
}

async function createSession(env, userId) {
  const token = randomToken();
  const expires = Date.now() + SESSION_DAYS * 86400000;
  await env.DB.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)')
    .bind(token, userId, expires).run();
  return token;
}

function bearerToken(request) {
  const h = request.headers.get('Authorization') || '';
  if (h.startsWith('Bearer ')) return h.slice(7).trim();
  const cookie = request.headers.get('Cookie') || '';
  const m = cookie.match(/(?:^|;\s*)dtx_session=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : '';
}

async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await pbkdf2(password, salt, 100000);
  return 'pbkdf2$100000$' + b64(salt) + '$' + b64(key);
}

async function verifyPassword(password, stored) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;
  const iter = Number(parts[1]);
  const salt = fromB64(parts[2]);
  const expected = fromB64(parts[3]);
  const actual = await pbkdf2(password, salt, iter);
  if (actual.byteLength !== expected.byteLength) return false;
  let diff = 0;
  const a = new Uint8Array(actual);
  const b = new Uint8Array(expected);
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function pbkdf2(password, salt, iterations) {
  const enc = new TextEncoder();
  const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  return crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    base,
    256
  );
}

async function verifyStripeSig(raw, header, secret) {
  const parts = Object.fromEntries(
    header.split(',').map((p) => {
      const i = p.indexOf('=');
      return [p.slice(0, i), p.slice(i + 1)];
    })
  );
  const t = parts.t;
  const v1 = parts.v1;
  if (!t || !v1) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(t + '.' + raw));
  const hex = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
  if (hex.length !== v1.length) return false;
  let diff = 0;
  for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ v1.charCodeAt(i);
  return diff === 0;
}

async function rateOk(env, request, action, limit, windowSec) {
  const ip = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || 'local';
  const key = action + ':' + ip;
  const now = Math.floor(Date.now() / 1000);
  const row = await env.DB.prepare('SELECT count, reset_at FROM rate_limits WHERE key = ?').bind(key).first();
  if (!row || row.reset_at < now) {
    await env.DB.prepare('INSERT OR REPLACE INTO rate_limits (key, count, reset_at) VALUES (?, 1, ?)')
      .bind(key, now + windowSec).run();
    return true;
  }
  if (row.count >= limit) return false;
  await env.DB.prepare('UPDATE rate_limits SET count = count + 1 WHERE key = ?').bind(key).run();
  return true;
}

async function getSetting(env, key) {
  const row = await env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind(key).first();
  return row ? row.value : '';
}

async function setSetting(env, key, value) {
  await env.DB.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').bind(key, value).run();
}

function applyDiscount(list, pct) {
  return money(list * (1 - clampDiscount(pct) / 100));
}

function clampDiscount(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(MAX_DISCOUNT, v));
}

function clampNum(n, min, max, fallback) {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.max(min, Math.min(max, v));
}

function money(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function normalizeEmail(s) {
  return String(s || '').trim().toLowerCase().slice(0, 120);
}

async function readJson(request) {
  try { return await request.json(); } catch { return {}; }
}

function randomToken() {
  const b = crypto.getRandomValues(new Uint8Array(32));
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
}

function b64(buf) {
  const bytes = buf instanceof ArrayBuffer ? new Uint8Array(buf) : buf;
  let s = '';
  for (const x of bytes) s += String.fromCharCode(x);
  return btoa(s);
}

function fromB64(s) {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function json(data, status, request) {
  return cors(new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  }), request);
}

function cors(res, request) {
  const origin = request.headers.get('Origin') || '';
  const headers = new Headers(res.headers);
  if (ALLOWED_ORIGINS.includes(origin)) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Vary', 'Origin');
  }
  headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  headers.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS');
  return new Response(res.body, { status: res.status, headers });
}

(function () {
  const TOKEN_KEY = 'dtx_session';
  const RESTORE_KEY = 'dtx_restore_order';
  const host = location.hostname;
  const localSite = (host === 'localhost' || host === '127.0.0.1') && location.port !== '8787';
  const API = window.DTX_API || (localSite ? 'http://127.0.0.1:8788/api' : 'https://doortronix-portal.misty-snow-1625.workers.dev/api');

  const STATUS = {
    draft: 'Draft',
    submitted: 'Submitted — awaiting confirmation',
    confirmed: 'Confirmed — deposit due',
    deposit_paid: 'Deposit paid — in queue',
    in_production: 'In production',
    ready_to_ship: 'Ready to ship — balance due',
    shipped: 'Shipped',
    cancelled: 'Cancelled',
  };

  function token() { return localStorage.getItem(TOKEN_KEY) || ''; }
  function setToken(t) { if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY); }

  async function api(path, opts) {
    const headers = { 'Content-Type': 'application/json', ...(opts && opts.headers) };
    if (token()) headers.Authorization = 'Bearer ' + token();
    const res = await fetch(API + path, { ...opts, headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || 'Request failed');
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  function money(n) {
    if (n == null || n === '') return '—';
    return '$' + Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function badge(status) {
    return '<span class="badge st-' + (status || '') + '">' + (STATUS[status] || status || '—') + '</span>';
  }

  function showErr(id, msg) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = msg;
    el.style.display = 'block';
  }

  function nav(me) {
    const links = document.getElementById('nav-links');
    if (!links) return;
    const quote = '../quote-combined.html';
    if (!me) {
      links.innerHTML =
        '<a href="login.html">Sign In</a>' +
        '<a href="signup.html">Create Account</a>' +
        '<a href="' + quote + '">Get a Quote</a>';
      return;
    }
    links.innerHTML =
      '<a href="index.html">Dashboard</a>' +
      '<a href="quotes.html">Saved Quotes</a>' +
      '<a href="orders.html">Orders</a>' +
      '<a href="' + quote + '">New Order</a>' +
      '<a href="account.html">Account</a>' +
      (me.isAdmin ? '<a href="admin.html">Admin</a>' : '') +
      '<a href="#" class="out" id="nav-out">Sign out</a>';
    const out = document.getElementById('nav-out');
    if (out) out.addEventListener('click', async (e) => {
      e.preventDefault();
      try { await api('/logout', { method: 'POST' }); } catch (_) {}
      setToken('');
      location.href = 'login.html';
    });
  }

  async function meOrNull() {
    if (!token()) return null;
    try {
      const data = await api('/me');
      return data.user;
    } catch {
      setToken('');
      return null;
    }
  }

  async function requireAuth() {
    const me = await meOrNull();
    if (!me) {
      location.href = 'login.html?next=' + encodeURIComponent(location.pathname + location.search);
      return null;
    }
    nav(me);
    return me;
  }

  function fillAuthPages() {
    nav(null);
    const params = new URLSearchParams(location.search);
    document.getElementById('signup-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = e.target.querySelector('button');
      btn.disabled = true;
      try {
        const data = await api('/signup', {
          method: 'POST',
          body: JSON.stringify({
            name: fv('su_name'),
            company: fv('su_company'),
            email: fv('su_email'),
            phone: fv('su_phone'),
            password: fv('su_password'),
          }),
        });
        setToken(data.token);
        location.href = safeNext(params.get('next'));
      } catch (err) {
        showErr('su_err', err.message);
        btn.disabled = false;
      }
    });
    document.getElementById('login-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = e.target.querySelector('button');
      btn.disabled = true;
      try {
        const data = await api('/login', {
          method: 'POST',
          body: JSON.stringify({ email: fv('li_email'), password: fv('li_password') }),
        });
        setToken(data.token);
        location.href = safeNext(params.get('next'));
      } catch (err) {
        showErr('li_err', err.message);
        btn.disabled = false;
      }
    });
  }

  async function dashboard() {
    const me = await requireAuth();
    if (!me) return;
    const [ordersRes, settings] = await Promise.all([api('/orders'), api('/settings')]);
    const orders = ordersRes.orders || [];
    document.getElementById('hello').textContent = 'Hello, ' + me.name.split(' ')[0];
    document.getElementById('co').textContent = me.company;
    document.getElementById('price-line').textContent = me.discountPct > 0
      ? me.discountPct + '% distributor discount on published contractor net'
      : 'Published contractor net (no additional discount yet)';
    document.getElementById('lead-line').textContent = settings.leadTime || '—';
    document.getElementById('stat-open').textContent = orders.filter((o) => !['shipped', 'cancelled'].includes(o.status)).length;
    document.getElementById('stat-due').textContent = orders.filter((o) => o.status === 'confirmed' && !o.deposit_paid).length;
    const recent = document.getElementById('recent-body');
    if (!orders.length) {
      recent.innerHTML = '<tr><td colspan="5" class="muted">No orders yet. Start a quote and submit it to your account.</td></tr>';
    } else {
      recent.innerHTML = orders.slice(0, 8).map(orderRow).join('');
    }
  }

  function orderRow(o) {
    return '<tr>' +
      '<td><a href="order.html?id=' + o.id + '"><strong>' + esc(o.number) + '</strong></a></td>' +
      '<td>' + esc(o.project_name || '—') + '</td>' +
      '<td>' + badge(o.status) + '</td>' +
      '<td class="price">' + money(o.confirmed_total != null ? o.confirmed_total : o.your_total) + '</td>' +
      '<td>' + (o.created_at || '').slice(0, 10) + '</td>' +
      '</tr>';
  }

  async function ordersPage() {
    const me = await requireAuth();
    if (!me) return;
    const data = await api('/orders');
    const body = document.getElementById('orders-body');
    const orders = data.orders || [];
    body.innerHTML = orders.length
      ? orders.map(orderRow).join('')
      : '<tr><td colspan="5" class="muted">No orders yet.</td></tr>';
  }

  async function quotesPage() {
    const me = await requireAuth();
    if (!me) return;
    const data = await api('/drafts');
    const body = document.getElementById('quotes-body');
    const drafts = data.drafts || [];
    if (!drafts.length) {
      body.innerHTML = '<tr><td colspan="5" class="muted">No saved quotes yet. Start a quote, add doors, and hit “Save quote.”</td></tr>';
      return;
    }
    body.innerHTML = drafts.map(draftRow).join('');
    body.addEventListener('click', async (e) => {
      const openId = e.target.getAttribute('data-open');
      const delId = e.target.getAttribute('data-del');
      if (openId) {
        e.target.disabled = true;
        try {
          const d = await api('/drafts/' + openId);
          const q = d.draft;
          localStorage.setItem(RESTORE_KEY, JSON.stringify({
            draftId: q.id,
            projectName: q.projectName,
            location: q.location,
            poNumber: q.poNumber,
            shipDate: q.shipDate,
            shipTo: q.shipTo,
            name: q.name,
            email: q.email,
            phone: q.phone,
            doors: q.doors || [],
          }));
          location.href = '../quote-combined.html';
        } catch (err) {
          showErr('page-err', err.message);
          e.target.disabled = false;
        }
      } else if (delId) {
        if (!confirm('Delete this saved quote? This cannot be undone.')) return;
        e.target.disabled = true;
        try {
          await api('/drafts/' + delId, { method: 'DELETE' });
          const tr = e.target.closest('tr');
          if (tr) tr.remove();
          if (!body.querySelector('tr')) {
            body.innerHTML = '<tr><td colspan="5" class="muted">No saved quotes yet.</td></tr>';
          }
        } catch (err) {
          showErr('page-err', err.message);
          e.target.disabled = false;
        }
      }
    });
  }

  function draftRow(q) {
    const name = q.title || q.projectName || q.poNumber || 'Untitled quote';
    const saved = (q.updatedAt || q.createdAt || '').slice(0, 16).replace('T', ' ');
    return '<tr>' +
      '<td><strong>' + esc(name) + '</strong>' + (q.location ? '<br><span class="muted" style="font-size:12px">' + esc(q.location) + '</span>' : '') + '</td>' +
      '<td>' + (q.doorCount != null ? q.doorCount : '—') + '</td>' +
      '<td class="price">' + money(q.listTotal) + '</td>' +
      '<td>' + esc(saved || '—') + '</td>' +
      '<td style="white-space:nowrap">' +
        '<button class="btn btn-blue" type="button" data-open="' + q.id + '" style="padding:6px 12px;font-size:12px">Open</button> ' +
        '<button class="btn btn-outline" type="button" data-del="' + q.id + '" style="padding:6px 10px;font-size:12px">Delete</button>' +
      '</td>' +
      '</tr>';
  }

  async function orderPage() {
    const me = await requireAuth();
    if (!me) return;
    const id = new URLSearchParams(location.search).get('id');
    if (!id) { location.href = 'orders.html'; return; }
    let data;
    try {
      data = me.isAdmin ? await api('/admin/orders/' + id) : await api('/orders/' + id);
    } catch (e1) {
      try { data = await api('/orders/' + id); }
      catch {
        document.getElementById('order-wrap').innerHTML = '<p class="err" style="display:block">Order not found.</p>';
        return;
      }
    }
    const o = data.order;
    document.getElementById('onum').textContent = o.number;
    document.getElementById('ostatus').innerHTML = badge(o.status);
    document.getElementById('oproject').textContent = o.projectName || '—';
    document.getElementById('oloc').textContent = o.location || '—';
    document.getElementById('opo').textContent = o.poNumber || '—';
    document.getElementById('olist').textContent = money(o.listTotal);
    document.getElementById('oyour').textContent = money(o.yourTotal);
    document.getElementById('oconf').textContent = o.confirmedTotal != null ? money(o.confirmedTotal) : 'Awaiting confirmation';
    document.getElementById('odep').textContent = o.depositAmount != null
      ? money(o.depositAmount) + (o.depositPaid ? ' — paid' : ' — due to start fabrication')
      : 'Set when price is confirmed';
    document.getElementById('olead').textContent = o.leadTime || '—';
    document.getElementById('ostart').textContent = o.leadStartsAt
      ? 'Started ' + o.leadStartsAt + (o.shipEstimate ? ' · Est. ship ' + o.shipEstimate : '')
      : 'Lead time starts when the deposit clears.';
    document.getElementById('odoors').innerHTML = (o.doors || []).map((d, i) => {
      return '<div class="door-line"><strong>Door ' + (i + 1) + ' — ' + esc(d.configLabel || d.config || 'Door') +
        '</strong><br>' + esc(d.widthStr || '') + ' × ' + esc(d.heightStr || '') +
        (d.estimatedTotal ? ' · ' + money(d.estimatedTotal) : '') + '</div>';
    }).join('') || '<p class="muted">No door details stored.</p>';

    const payDep = document.getElementById('pay-deposit');
    const payBal = document.getElementById('pay-balance');
    const payNote = document.getElementById('pay-note');
    if (o.confirmedTotal != null && !o.depositPaid) {
      payDep.classList.remove('hidden');
      payDep.onclick = () => pay(o.id, 'deposit', payDep);
    } else if (!o.depositPaid) {
      payNote.textContent = 'Online payment opens after Doortronix confirms the price.';
    }
    if (o.depositPaid && !o.balancePaid && o.confirmedTotal != null) {
      payBal.classList.remove('hidden');
      payBal.onclick = () => pay(o.id, 'balance', payBal);
    }

    document.getElementById('btn-dup').onclick = async () => {
      const dup = await api('/orders/' + o.id + '/duplicate', { method: 'POST' });
      localStorage.setItem(RESTORE_KEY, JSON.stringify(dup.restore));
      location.href = '../quote-combined.html';
    };
  }

  async function pay(id, kind, btn) {
    btn.disabled = true;
    try {
      const data = await api('/orders/' + id + '/pay', { method: 'POST', body: JSON.stringify({ kind }) });
      if (data.url) { location.href = data.url; return; }
      showErr('pay-err', data.error || 'Could not start payment.');
    } catch (err) {
      showErr('pay-err', err.message);
    }
    btn.disabled = false;
  }

  async function accountPage() {
    const me = await requireAuth();
    if (!me) return;
    document.getElementById('ac_name').value = me.name;
    document.getElementById('ac_company').value = me.company;
    document.getElementById('ac_email').value = me.email;
    document.getElementById('ac_phone').value = me.phone;
    document.getElementById('ac_disc').textContent = me.discountPct > 0
      ? me.discountPct + '% off published contractor net'
      : 'Published contractor net';
    document.getElementById('ac_dep').textContent = me.depositPct + '% deposit to start fabrication';
    document.getElementById('account-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await api('/me', {
          method: 'PATCH',
          body: JSON.stringify({
            name: fv('ac_name'),
            company: fv('ac_company'),
            phone: fv('ac_phone'),
          }),
        });
        document.getElementById('ac_ok').style.display = 'block';
      } catch (err) {
        showErr('ac_err', err.message);
      }
    });
  }

  async function adminPage() {
    const me = await requireAuth();
    if (!me) return;
    if (!me.isAdmin) {
      document.getElementById('admin-wrap').innerHTML = '<p class="err" style="display:block">Admin only. Create your login, then promote it with ADMIN_BOOTSTRAP or a D1 UPDATE users SET is_admin=1.</p>';
      return;
    }
    const [cos, ords, settings] = await Promise.all([
      api('/admin/companies'),
      api('/admin/orders'),
      api('/settings'),
    ]);
    document.getElementById('ad_lead').value = settings.leadTime || '';
    document.getElementById('lead-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      await api('/admin/settings', { method: 'PATCH', body: JSON.stringify({ leadTime: fv('ad_lead') }) });
      document.getElementById('lead_ok').classList.remove('hidden');
    });

    document.getElementById('co-body').innerHTML = (cos.companies || []).map((c) => {
      return '<tr>' +
        '<td><strong>' + esc(c.name) + '</strong></td>' +
        '<td><input data-co="' + c.id + '" data-f="discount" type="number" min="0" max="80" step="0.5" value="' + c.discount_pct + '" style="width:72px"></td>' +
        '<td><input data-co="' + c.id + '" data-f="deposit" type="number" min="10" max="100" step="5" value="' + c.deposit_pct + '" style="width:72px"></td>' +
        '<td><input data-co="' + c.id + '" data-f="self" type="checkbox"' + (c.self_serve ? ' checked' : '') + '></td>' +
        '<td>' + c.user_count + ' / ' + c.order_count + '</td>' +
        '<td><button class="btn btn-blue" type="button" data-save="' + c.id + '">Save</button></td>' +
        '</tr>';
    }).join('');

    document.getElementById('co-body').addEventListener('click', async (e) => {
      const id = e.target.getAttribute('data-save');
      if (!id) return;
      const disc = document.querySelector('[data-co="' + id + '"][data-f="discount"]').value;
      const dep = document.querySelector('[data-co="' + id + '"][data-f="deposit"]').value;
      const self = document.querySelector('[data-co="' + id + '"][data-f="self"]').checked;
      e.target.disabled = true;
      await api('/admin/companies/' + id, {
        method: 'PATCH',
        body: JSON.stringify({ discountPct: Number(disc), depositPct: Number(dep), selfServe: self }),
      });
      e.target.textContent = 'Saved';
      setTimeout(() => { e.target.textContent = 'Save'; e.target.disabled = false; }, 1200);
    });

    document.getElementById('ad-orders').innerHTML = (ords.orders || []).map((o) => {
      return '<tr>' +
        '<td><a href="order.html?id=' + o.id + '"><strong>' + esc(o.number) + '</strong></a></td>' +
        '<td>' + esc(o.company_name) + '</td>' +
        '<td>' + badge(o.status) + '</td>' +
        '<td class="price">' + money(o.confirmed_total != null ? o.confirmed_total : o.your_total) + '</td>' +
        '<td>' +
          '<select data-ord="' + o.id + '" style="width:160px;font-size:12px">' +
            opt(o.status, 'submitted', 'Submitted') +
            opt(o.status, 'confirmed', 'Confirmed') +
            opt(o.status, 'deposit_paid', 'Deposit paid') +
            opt(o.status, 'in_production', 'In production') +
            opt(o.status, 'ready_to_ship', 'Ready to ship') +
            opt(o.status, 'shipped', 'Shipped') +
            opt(o.status, 'cancelled', 'Cancelled') +
          '</select> ' +
          '<input data-tot="' + o.id + '" type="number" placeholder="Confirm $" value="' + (o.confirmed_total || '') + '" style="width:100px;font-size:12px"> ' +
          '<button class="btn btn-outline" type="button" data-ok="' + o.id + '" style="padding:6px 10px;font-size:12px">Update</button>' +
        '</td>' +
        '</tr>';
    }).join('');

    document.getElementById('ad-orders').addEventListener('click', async (e) => {
      const id = e.target.getAttribute('data-ok');
      if (!id) return;
      const status = document.querySelector('[data-ord="' + id + '"]').value;
      const tot = document.querySelector('[data-tot="' + id + '"]').value;
      e.target.disabled = true;
      await api('/admin/orders/' + id, {
        method: 'PATCH',
        body: JSON.stringify({ status, confirmedTotal: tot === '' ? undefined : Number(tot) }),
      });
      location.reload();
    });
  }

  function opt(cur, val, label) {
    return '<option value="' + val + '"' + (cur === val ? ' selected' : '') + '>' + label + '</option>';
  }

  async function payReturn() {
    await requireAuth();
    const id = new URLSearchParams(location.search).get('order');
    if (id) {
      document.getElementById('back-order').href = 'order.html?id=' + id;
    }
  }

  function safeNext(raw) {
    const allowed = ['index.html', 'orders.html', 'order.html', 'account.html', 'admin.html', 'pay-return.html'];
    const s = String(raw || '').trim();
    if (!s || /[\\]/.test(s) || /:/.test(s) || s.startsWith('//') || s.includes('..')) return 'index.html';
    const [path, query] = s.split('?');
    const file = path.split('/').pop();
    if (!allowed.includes(file)) return 'index.html';
    if (query && !/^[a-zA-Z0-9_=&-]+$/.test(query)) return file;
    return query ? file + '?' + query : file;
  }
  function fv(id) { return (document.getElementById(id) || {}).value || ''; }
  function esc(s) {
    return String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  window.DTX = { api, token, setToken, meOrNull, money, RESTORE_KEY, API };

  document.addEventListener('DOMContentLoaded', () => {
    const page = document.body.getAttribute('data-page');
    if (page === 'auth') fillAuthPages();
    else if (page === 'dash') dashboard().catch((e) => showErr('page-err', e.message));
    else if (page === 'quotes') quotesPage().catch((e) => showErr('page-err', e.message));
    else if (page === 'orders') ordersPage().catch((e) => showErr('page-err', e.message));
    else if (page === 'order') orderPage().catch((e) => showErr('page-err', e.message));
    else if (page === 'account') accountPage().catch((e) => showErr('page-err', e.message));
    else if (page === 'admin') adminPage().catch((e) => showErr('page-err', e.message));
    else if (page === 'pay-return') payReturn();
  });
})();

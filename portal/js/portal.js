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
  function warrBadge(status) {
    if (status === 'covered') return '<span class="badge st-covered">Covered</span>';
    if (status === 'expired') return '<span class="badge st-expired">Expired</span>';
    return '<span class="muted">—</span>';
  }
  function warrFromRow(o) {
    const ends = o.warranty_ends || o.warrantyEnds || '';
    if (!ends) return o.status === 'shipped' ? 'Starts at ship' : '—';
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
    const st = ends >= today ? 'covered' : 'expired';
    return warrBadge(st) + ' <span class="muted">thru ' + esc(ends) + '</span>';
  }
  function trackingUrl(carrier, num) {
    const n = encodeURIComponent(num || '');
    if (!n) return '';
    const c = String(carrier || '').toLowerCase();
    if (/ups/.test(c)) return 'https://www.ups.com/track?tracknum=' + n;
    if (/fedex/.test(c)) return 'https://www.fedex.com/fedextrack/?trknbr=' + n;
    if (/usps/.test(c)) return 'https://tools.usps.com/go/TrackConfirmAction?tLabels=' + n;
    if (/estes/.test(c)) return 'https://www.estes-express.com/myestes/shipment-tracking/';
    if (/saia/.test(c)) return 'https://www.saia.com/track';
    if (/old.?dominion|odfl/.test(c)) return 'https://www.odfl.com/us/en/tools/trace.html';
    if (/xpo/.test(c)) return 'https://www.xpo.com/track/';
    if (/abf|arcb/.test(c)) return 'https://arcb.com/tools/tracking';
    return '';
  }
  function trackLink(carrier, num, label) {
    if (!num) return '';
    const href = trackingUrl(carrier, num);
    const text = (label || 'Track') + ' ' + num;
    return href
      ? '<a href="' + href + '" target="_blank" rel="noopener">' + esc(text) + '</a>'
      : esc(text);
  }
  function freightLabel(t) {
    return ({ ltl: 'LTL / motor freight', parcel: 'Parcel', pickup: 'Customer pickup' })[t] || t || '—';
  }
  function defaultSerials(doors, existing) {
    const have = Array.isArray(existing) ? existing : [];
    return (doors || []).map((d, i) => {
      const prev = have.find((s) => Number(s.i) === i) || have[i] || {};
      const op = d.typeCategory === 'operator' || d.config === 'operator';
      return {
        i,
        label: d.configLabel || d.config || (op ? 'Swing operator' : 'Door'),
        sku: d.configCode || prev.sku || '',
        serial: prev.serial || '',
        maBuyDate: prev.maBuyDate || '',
      };
    });
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
    const quote = '../quote-combined.html?new=1';
    if (!me) {
      links.innerHTML =
        '<a href="login.html">Sign In</a>' +
        '<a href="signup.html">Create Account</a>' +
        '<a href="' + quote + '">Get a Quote</a>';
      return;
    }
    links.innerHTML =
      '<a href="index.html">Dashboard</a>' +
      '<a href="quotes.html">Saved Estimates</a>' +
      '<a href="orders.html">Orders</a>' +
      '<a href="' + quote + '">Price a job</a>' +
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
    const next = params.get('next');
    if (next) {
      document.querySelectorAll('a[href="signup.html"], a[href="login.html"]').forEach((a) => {
        a.setAttribute('href', a.getAttribute('href').split('?')[0] + '?next=' + encodeURIComponent(next));
      });
    }
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
    const [ordersRes, settings, draftsRes] = await Promise.all([
      api('/orders'),
      api('/settings'),
      api('/drafts').catch(() => ({ drafts: [] })),
    ]);
    const orders = ordersRes.orders || [];
    const drafts = draftsRes.drafts || [];
    document.getElementById('hello').textContent = 'Hello, ' + me.name.split(' ')[0];
    document.getElementById('co').textContent = me.company;
    document.getElementById('price-line').textContent = me.discountPct > 0
      ? me.discountPct + '% distributor discount on published contractor net'
      : 'Published contractor net (no additional discount yet)';
    document.getElementById('lead-line').textContent = settings.leadTime || '—';
    document.getElementById('stat-open').textContent = orders.filter((o) => !['shipped', 'cancelled'].includes(o.status)).length;
    document.getElementById('stat-due').textContent = orders.filter((o) => o.status === 'confirmed' && !o.deposit_paid).length;
    const draftStat = document.getElementById('stat-drafts');
    if (draftStat) draftStat.textContent = drafts.length;
    const recent = document.getElementById('recent-body');
    if (!orders.length) {
      recent.innerHTML = '<tr><td colspan="7" class="muted">No orders yet. An estimate stays on your dashboard until you send it to Doortronix.</td></tr>';
    } else {
      recent.innerHTML = orders.slice(0, 8).map(orderRow).join('');
    }
    const dbody = document.getElementById('dash-drafts-body');
    if (dbody) {
      if (!drafts.length) {
        dbody.innerHTML = '<tr><td colspan="5" class="muted">No saved estimates yet. Price a job, add the openings, and hit “Save estimate.”</td></tr>';
      } else {
        dbody.innerHTML = drafts.slice(0, 6).map(draftRow).join('');
        wireDraftActions(dbody);
      }
    }
  }

  function etaFromOrder(o) {
    return o.eta_ship || o.etaShip || o.ship_estimate || o.shipEstimate || '';
  }
  function orderRow(o) {
    const eta = etaFromOrder(o);
    return '<tr>' +
      '<td><a href="order.html?id=' + o.id + '"><strong>' + esc(o.number) + '</strong></a></td>' +
      '<td>' + esc(o.project_name || '—') + '</td>' +
      '<td>' + badge(o.status) + '</td>' +
      '<td class="price">' + money(o.confirmed_total != null ? o.confirmed_total : o.your_total) + '</td>' +
      '<td>' + (eta ? esc(eta) : '<span class="muted">—</span>') + '</td>' +
      '<td>' + warrFromRow(o) + '</td>' +
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
      : '<tr><td colspan="7" class="muted">No orders yet.</td></tr>';
  }

  async function quotesPage() {
    const me = await requireAuth();
    if (!me) return;
    const data = await api('/drafts');
    const body = document.getElementById('quotes-body');
    const drafts = data.drafts || [];
    if (!drafts.length) {
      body.innerHTML = '<tr><td colspan="5" class="muted">No saved estimates yet. Price a job, add the openings, and hit “Save estimate.”</td></tr>';
      return;
    }
    body.innerHTML = drafts.map(draftRow).join('');
    wireDraftActions(body);
  }

  function wireDraftActions(body) {
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
        if (!confirm('Delete this saved estimate? This cannot be undone.')) return;
        e.target.disabled = true;
        try {
          await api('/drafts/' + delId, { method: 'DELETE' });
          const tr = e.target.closest('tr');
          if (tr) tr.remove();
          if (!body.querySelector('tr')) {
            body.innerHTML = '<tr><td colspan="5" class="muted">No saved estimates yet.</td></tr>';
          }
        } catch (err) {
          showErr('page-err', err.message);
          e.target.disabled = false;
        }
      }
    });
  }

  function draftRow(q) {
    const name = q.title || q.projectName || q.poNumber || 'Untitled estimate';
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

  function renderShip(o) {
    if (!o.shippedOn && !o.carrier && !o.trackingNumber && !o.proNumber) {
      return 'Not shipped yet.';
    }
    const rows = [];
    if (o.shippedOn) rows.push(['Shipped', o.shippedOn]);
    if (o.freightType) rows.push(['How', freightLabel(o.freightType)]);
    if (o.carrier) rows.push(['Carrier', o.carrier]);
    if (o.trackingNumber) rows.push(['Tracking', trackLink(o.carrier, o.trackingNumber, 'Track')]);
    if (o.proNumber) rows.push(['PRO', trackLink(o.carrier, o.proNumber, 'PRO')]);
    if (o.shipNotes) rows.push(['Notes', o.shipNotes]);
    return rows.map((r) => '<div><span class="muted">' + esc(r[0]) + '</span> — ' + (r[0] === 'Tracking' || r[0] === 'PRO' ? r[1] : esc(r[1])) + '</div>').join('');
  }
  function renderWarranty(o, serials) {
    if (!o.shippedOn) {
      return 'Starts the day this order ships from Malakoff. One year from that date. Door and frame: Doortronix. Condor operator: Motion Access parts, through us.';
    }
    const st = o.warrantyStatus || '';
    const lines = [
      warrBadge(st) + (o.warrantyEnds ? ' through <strong>' + esc(o.warrantyEnds) + '</strong>' : ''),
      '<p class="muted" style="margin-top:8px">One year from ship date ' + esc(o.shippedOn) + '. Labor, freight, glass, and installation are not included.</p>',
    ];
    const withSer = (serials || []).filter((s) => s.serial);
    if (withSer.length) {
      lines.push('<p>' + withSer.map((s) => esc(s.label) + ': <strong>' + esc(s.serial) + '</strong>').join('<br>') + '</p>');
    }
    return lines.join('');
  }
  function fillAdminShip(o, serials) {
    const card = document.getElementById('admin-ship-card');
    if (!card) return;
    card.classList.remove('hidden');
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v || ''; };
    set('ad_signed', o.drawingSignedOn);
    set('ad_deposit_on', o.depositPaidOn);
    const etaPrev = document.getElementById('ad_eta_preview');
    if (etaPrev) etaPrev.textContent = o.etaShip ? 'ETA ship ' + o.etaShip : 'ETA ship — enter both dates, then save';
    set('ad_shipped', o.shippedOn);
    set('ad_warr_end', o.warrantyEnds);
    const shipEl = document.getElementById('ad_shipped');
    const warrEl = document.getElementById('ad_warr_end');
    if (shipEl && warrEl) {
      shipEl.addEventListener('change', () => {
        if (!shipEl.value) return;
        const m = shipEl.value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (!m) return;
        const y = Number(m[1]) + 1;
        const mo = Number(m[2]);
        let d = Number(m[3]);
        const last = new Date(Date.UTC(y, mo, 0)).getUTCDate();
        if (d > last) d = last;
        warrEl.value = y + '-' + String(mo).padStart(2, '0') + '-' + String(d).padStart(2, '0');
      });
    }
    set('ad_freight', o.freightType);
    set('ad_carrier', o.carrier);
    set('ad_track', o.trackingNumber);
    set('ad_pro', o.proNumber);
    set('ad_freight_cost', o.freightCost != null ? o.freightCost : '');
    set('ad_shipnotes', o.shipNotes);
    document.getElementById('ad-serials').innerHTML = serials.map((s, i) => {
      return '<div class="two" style="margin-bottom:8px">' +
        '<div><label>Line ' + (i + 1) + ' — ' + esc(s.label) + '</label>' +
        '<input data-ser="' + i + '" data-f="serial" placeholder="Serial" value="' + esc(s.serial) + '"></div>' +
        '<div><label>SKU / MA buy date</label>' +
        '<div class="two"><input data-ser="' + i + '" data-f="sku" placeholder="SKU" value="' + esc(s.sku) + '">' +
        '<input data-ser="' + i + '" data-f="ma" type="date" value="' + esc(s.maBuyDate) + '"></div></div></div>';
    }).join('') || '<p class="muted">No lines on this order.</p>';
    const claims = o.warrantyClaims || [];
    document.getElementById('ad-claims').innerHTML = claims.length
      ? claims.map((c) => '<div class="door-line">' + esc(c.date) + ' — ' + esc(c.what) +
        (c.part ? ' · part ' + esc(c.part) : '') +
        (c.notes ? '<br><span class="muted">' + esc(c.notes) + '</span>' : '') + '</div>').join('')
      : 'None yet.';
    const btn = document.getElementById('ad-ship-save');
    if (btn) {
      btn.onclick = async () => {
        btn.disabled = true;
        try {
          const nextSerials = serials.map((s, i) => ({
            i,
            label: s.label,
            sku: (document.querySelector('[data-ser="' + i + '"][data-f="sku"]') || {}).value || '',
            serial: (document.querySelector('[data-ser="' + i + '"][data-f="serial"]') || {}).value || '',
            maBuyDate: (document.querySelector('[data-ser="' + i + '"][data-f="ma"]') || {}).value || '',
          }));
          const what = fv('ad_claim_what');
          const body = {
            drawingSignedOn: fv('ad_signed'),
            depositPaidOn: fv('ad_deposit_on'),
            shippedOn: fv('ad_shipped'),
            warrantyEnds: fv('ad_warr_end'),
            freightType: fv('ad_freight'),
            carrier: fv('ad_carrier'),
            trackingNumber: fv('ad_track'),
            proNumber: fv('ad_pro'),
            freightCost: fv('ad_freight_cost') === '' ? null : Number(fv('ad_freight_cost')),
            shipNotes: fv('ad_shipnotes'),
            serials: nextSerials,
          };
          if (o.status !== 'shipped' && body.shippedOn) body.status = 'shipped';
          if (what || fv('ad_claim_part') || fv('ad_claim_notes')) {
            body.addClaim = { what, part: fv('ad_claim_part'), notes: fv('ad_claim_notes') };
          }
          await api('/admin/orders/' + o.id, { method: 'PATCH', body: JSON.stringify(body) });
          location.reload();
        } catch (err) {
          showErr('ad-ship-err', err.message);
          btn.disabled = false;
        }
      };
    }
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
    const etaEl = document.getElementById('oeta');
    if (etaEl) {
      etaEl.textContent = o.etaShip
        ? 'ETA ship ' + o.etaShip
        : 'ETA ship — awaiting deposit date and signed drawing date';
    }
    const startBits = [];
    if (o.depositPaidOn) startBits.push('Deposit ' + o.depositPaidOn);
    if (o.drawingSignedOn) startBits.push('Signed drawing ' + o.drawingSignedOn);
    document.getElementById('ostart').textContent = startBits.length
      ? startBits.join(' · ') + '. Four weeks, then the first weekday that is not a US federal holiday.'
      : 'Lead time starts when we have both the deposit and the signed confirmation drawing.';
    const serials = defaultSerials(o.doors, o.serials);
    document.getElementById('oship').innerHTML = renderShip(o);
    document.getElementById('owarranty').innerHTML = renderWarranty(o, serials);
    document.getElementById('odoors').innerHTML = (o.doors || []).map((d, i) => {
      const ser = serials[i];
      return '<div class="door-line"><strong>Door ' + (i + 1) + ' — ' + esc(d.configLabel || d.config || 'Door') +
        '</strong><br>' + esc(d.widthStr || '') + ' × ' + esc(d.heightStr || '') +
        (d.estimatedTotal ? ' · ' + money(d.estimatedTotal) : '') +
        (ser && ser.serial ? '<br><span class="muted">Serial ' + esc(ser.serial) + (ser.sku ? ' · ' + esc(ser.sku) : '') + '</span>' : '') +
        '</div>';
    }).join('') || '<p class="muted">No door details stored.</p>';
    if (me.isAdmin) fillAdminShip(o, serials);

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

  function inviteUrl(token) {
    return location.origin + '/portal/accept.html?token=' + encodeURIComponent(token);
  }
  function showInviteResult(data) {
    const url = inviteUrl(data.token);
    const box = document.getElementById('inv_result');
    const input = document.getElementById('inv_url');
    const mail = document.getElementById('inv_mail');
    const meta = document.getElementById('inv_meta');
    if (input) input.value = url;
    if (box) box.classList.remove('hidden');
    if (meta) {
      meta.textContent = (data.company || '') + ' · ' + (data.email || '') +
        (data.discountPct ? ' · ' + data.discountPct + '% off' : ' · published contractor net') +
        ' · expires in 14 days';
    }
    if (mail) {
      const sub = encodeURIComponent('Your Doortronix account');
      const body = encodeURIComponent(
        'You have a Doortronix USA account with your company pricing.\n\n' +
        'Open this link to set your password and sign in:\n' + url + '\n\n' +
        'The link expires in 14 days. After that, ask us for a new one.\n'
      );
      mail.href = 'mailto:' + encodeURIComponent(data.email || '') + '?subject=' + sub + '&body=' + body;
    }
    box?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  async function submitInvite(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    const err = document.getElementById('inv_err');
    if (err) { err.style.display = 'none'; err.textContent = ''; }
    if (btn) btn.disabled = true;
    try {
      const data = await api('/admin/invites', {
        method: 'POST',
        body: JSON.stringify({
          name: fv('inv_name'),
          company: fv('inv_company'),
          email: fv('inv_email'),
          phone: fv('inv_phone'),
          discountPct: Number(fv('inv_disc') || 0),
          depositPct: Number(fv('inv_dep') || 50),
        }),
      });
      showInviteResult(data);
      const invs = await api('/admin/invites').catch(() => ({ invites: [] }));
      renderInvites(invs.invites || []);
    } catch (ex) {
      showErr('inv_err', ex.message);
    }
    if (btn) btn.disabled = false;
  }
  async function copyInviteLink() {
    const input = document.getElementById('inv_url');
    if (!input || !input.value) return;
    try {
      await navigator.clipboard.writeText(input.value);
      const btn = document.getElementById('inv_copy');
      if (btn) { btn.textContent = 'Copied'; setTimeout(() => { btn.textContent = 'Copy link'; }, 1200); }
    } catch (_) {
      input.select();
      document.execCommand('copy');
    }
  }
  function renderInvites(rows) {
    const body = document.getElementById('inv-body');
    if (!body) return;
    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="5" class="muted">No invites yet.</td></tr>';
      return;
    }
    const now = Date.now();
    body.innerHTML = rows.map((i) => {
      let status = 'Pending';
      if (i.used_at) status = 'Accepted';
      else if (i.expires_at < now) status = 'Expired';
      return '<tr>' +
        '<td>' + esc(i.company) + '</td>' +
        '<td>' + esc(i.email) + '<div class="muted">' + esc(i.name) + '</div></td>' +
        '<td>' + (i.discount_pct ? i.discount_pct + '%' : '—') + '</td>' +
        '<td>' + esc(status) + '</td>' +
        '<td>' + (i.used_at ? '' : '<button class="btn btn-outline" type="button" data-resend="' + i.id + '">New link</button>') + '</td>' +
        '</tr>';
    }).join('');
    body.querySelectorAll('[data-resend]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        try {
          const data = await api('/admin/invites/' + btn.getAttribute('data-resend') + '/resend', { method: 'POST' });
          showInviteResult(data);
        } catch (ex) {
          showErr('inv_err', ex.message);
        }
        btn.disabled = false;
      });
    });
  }

  async function acceptPage() {
    nav(null);
    const token = new URLSearchParams(location.search).get('token') || '';
    const form = document.getElementById('accept-form');
    const bad = document.getElementById('acc_bad');
    if (!token) {
      if (bad) { bad.style.display = 'block'; bad.textContent = 'This invite link is missing. Ask Doortronix for a new one.'; }
      return;
    }
    try {
      const inv = await api('/invite?token=' + encodeURIComponent(token));
      document.getElementById('acc_name').value = inv.name || '';
      document.getElementById('acc_company').value = inv.company || '';
      document.getElementById('acc_email').value = inv.email || '';
      const tier = document.getElementById('acc_tier');
      if (tier) {
        tier.textContent = inv.discountPct > 0
          ? 'Your pricing: ' + inv.discountPct + '% off published contractor net.'
          : 'Your pricing: published contractor net.';
      }
      const lead = document.getElementById('acc_lead');
      if (lead) lead.textContent = 'Hi ' + (inv.name || '').split(' ')[0] + ' — set a password for ' + (inv.company || 'your company') + ' to see your net on quotes.';
      if (form) form.classList.remove('hidden');
    } catch (err) {
      if (bad) { bad.style.display = 'block'; bad.textContent = err.message || 'This invite link is invalid or expired.'; }
      return;
    }
    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = e.target.querySelector('button');
      if (btn) btn.disabled = true;
      try {
        const data = await api('/invite/accept', {
          method: 'POST',
          body: JSON.stringify({ token, password: fv('acc_password') }),
        });
        setToken(data.token);
        location.href = 'index.html';
      } catch (err) {
        showErr('acc_err', err.message);
        if (btn) btn.disabled = false;
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
    const [cos, ords, settings, invs] = await Promise.all([
      api('/admin/companies'),
      api('/admin/orders'),
      api('/settings'),
      api('/admin/invites').catch(() => ({ invites: [] })),
    ]);
    renderInvites(invs.invites || []);
    document.getElementById('invite-form')?.addEventListener('submit', submitInvite);
    document.getElementById('inv_copy')?.addEventListener('click', copyInviteLink);
    document.getElementById('ad_lead').value = settings.leadTime || '';
    document.getElementById('lead-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      await api('/admin/settings', { method: 'PATCH', body: JSON.stringify({ leadTime: fv('ad_lead') }) });
      document.getElementById('lead_ok').classList.remove('hidden');
    });

    document.getElementById('co-body').innerHTML = (cos.companies || []).map((c) => {
      const people = (c.users || []).map((u) => {
        const mail = esc(u.email || '');
        const name = u.name ? '<div class="muted">' + esc(u.name) + '</div>' : '';
        return (mail ? '<a href="mailto:' + mail + '">' + mail + '</a>' : '—') + name;
      }).join('<div style="height:8px"></div>');
      return '<tr>' +
        '<td><strong>' + esc(c.name) + '</strong></td>' +
        '<td>' + (people || '<span class="muted">—</span>') + '</td>' +
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
      const shipBit = o.shipped_on
        ? esc(o.shipped_on) + '<br>' + warrFromRow(o)
        : (o.eta_ship ? 'ETA ' + esc(o.eta_ship) : '<span class="muted">—</span>');
      return '<tr>' +
        '<td><a href="order.html?id=' + o.id + '"><strong>' + esc(o.number) + '</strong></a></td>' +
        '<td>' + esc(o.company_name) + '</td>' +
        '<td>' + badge(o.status) + '</td>' +
        '<td class="price">' + money(o.confirmed_total != null ? o.confirmed_total : o.your_total) + '</td>' +
        '<td>' + shipBit + '</td>' +
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
    if (s === '../quote-combined.html' || s === '/quote-combined.html' || s === 'quote-combined.html') {
      return '../quote-combined.html';
    }
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
    else if (page === 'accept') acceptPage().catch((e) => showErr('acc_bad', e.message));
    else if (page === 'pay-return') payReturn();
  });
})();

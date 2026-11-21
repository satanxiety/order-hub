(async () => {
  const HUB = 'https://satanxiety.github.io/order-hub/';
  const HUB_ORIGIN = 'https://satanxiety.github.io';
  const EVERY_MIN = 15;
  if (!/(^|\.)etsy\.com$/.test(location.hostname)) { alert('Order Hub: use this button on an Etsy Shop Manager page (etsy.com/your/orders/sold).'); return; }
  const SH = { 68640007: 'Novelle', 69235788: 'Lumiva', 69236512: 'MiniBoutique' };
  const C = (window.Etsy && Etsy.Context && Etsy.Context.data) || {};
  const shop = C.shop_id || +((document.documentElement.innerHTML.match(/"shop_id"\s*:\s*"?(\d+)/) || [])[1] || 0);
  if (!shop) { alert('Order Hub: shop not found. Open Etsy Shop Manager > Orders first.'); return; }
  const store = SH[shop] || C.shop_name || String(shop);

  /* already running in this tab? -> just sync now */
  if (window.__ohAuto) { window.__ohAuto.now(true); return; }

  /* ---------- badge ---------- */
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;z-index:2147483647;bottom:16px;right:16px;background:#15122b;color:#fff;padding:12px 14px;border-radius:14px;font:13px/1.45 -apple-system,Segoe UI,sans-serif;box-shadow:0 8px 28px #0007;max-width:340px';
  box.innerHTML = '<div style="font-weight:800;margin-bottom:4px">📦 Order Hub · ' + store + '</div><div id="__ohs">…</div><div id="__ohn" style="opacity:.7;font-size:12px;margin-top:2px"></div>' +
    '<div style="display:flex;gap:6px;margin-top:8px"><button id="__ohnow" style="background:#6d4aff;color:#fff;border:0;border-radius:8px;padding:5px 10px;font-weight:700;cursor:pointer">Sync now</button>' +
    '<button id="__ohstop" style="background:#ffffff1a;color:#fff;border:0;border-radius:8px;padding:5px 10px;cursor:pointer">Stop</button>' +
    '<button id="__ohmin" style="background:transparent;color:#fff;border:0;margin-left:auto;cursor:pointer">—</button></div>';
  document.body.appendChild(box);
  const say = t => { box.querySelector('#__ohs').textContent = t; };
  const next = t => { box.querySelector('#__ohn').textContent = t; };
  const hhmm = d => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  /* ---------- hub window + handshake ---------- */
  let w = window.open(HUB + '#etsy-sync', 'ohsync');
  let ready = false, waiters = [];
  window.addEventListener('message', e => {
    if (e.origin !== HUB_ORIGIN) return;
    const d = e.data || {};
    if (d.type === 'oh-ready') { ready = true; waiters.splice(0).forEach(f => f()); }
    else if (d.type === 'oh-res') {
      if (d.error) say('⚠ ' + d.error);
      else say('✓ ' + hhmm(new Date()) + ' · ' + d.total + ' orders · ' + d.created + ' new · ' + d.updated + ' updated');
    }
  });
  const waitReady = () => ready ? Promise.resolve() : new Promise(r => waiters.push(r));

  /* ---------- read Etsy ---------- */
  const EU = ['Austria','Belgium','Bulgaria','Croatia','Cyprus','Czech Republic','Czechia','Denmark','Estonia','Finland','France','Germany','Greece','Hungary','Ireland','Italy','Latvia','Lithuania','Luxembourg','Malta','Netherlands','The Netherlands','Poland','Portugal','Romania','Slovakia','Slovenia','Spain','Sweden'];
  const dec = s => { const t = document.createElement('textarea'); t.innerHTML = String(s || ''); return t.value; };
  const ts = x => x ? new Date((x < 1e12 ? x * 1000 : x)).toISOString() : '';
  const money = x => x && x.formatted_value ? x.formatted_value.replace('US$', '$') : '';
  const nz = x => x && x.value !== undefined ? +x.value > 0 : !!(x && /[1-9]/.test(x.formatted_value || ''));
  async function readEtsy() {
    const base = '/api/v3/ajax/bespoke/shop/' + shop + '/mission-control/orders/data?filters%5Bbuyer_id%5D=all&filters%5Bchannel%5D=all&filters%5Bcompleted_status%5D=all&filters%5Bcompleted_date%5D=all&filters%5Bdestination%5D=all&filters%5Bship_date%5D=all&filters%5Bshipping_label_eligibility%5D=false&filters%5Bshipping_label_status%5D=all&filters%5Bhas_buyer_notes%5D=false&filters%5Bis_marked_as_gift%5D=false&filters%5Bis_personalized%5D=false&filters%5Bhas_shipping_upgrade%5D=false&filters%5Bmessage_status%5D=all&filters%5Border_state_id%5D=all&search_terms=&sort_by=order_date&sort_order=asc&objects_enabled_for_normalization%5Border_state%5D=true';
    let A = [], off = 0, total = 0;
    do {
      const res = await fetch(base + '&limit=50&offset=' + off);
      if (!res.ok) throw new Error('Etsy ' + res.status + ' (logged out?)');
      const r = (await res.json()).orders_search;
      total = r.total_count; A.push(...r.orders); off += 50; if (!r.orders.length) break;
      say('reading Etsy… ' + A.length + '/' + total);
    } while (off < total);
    return A.map(o => {
      const f = o.fulfillment || {}, a = f.to_address || {}, pay = o.payment || {}, cb = pay.cost_breakdown || {}, tx = o.transactions || [];
      const ss = (f.status && f.status.physical_status && f.status.physical_status.shipping_status) || {};
      const sum = (ss.tracking_status && ss.tracking_status.summary) || '';
      let status = 'new';
      if (o.is_canceled || pay.is_fully_refunded) status = 'cancelled';
      else if (f.was_shipped) status = /deliver/i.test(sum) ? 'delivered' : 'shipped';
      let tax = '';
      if (EU.includes(a.country)) tax = 'IOSS IM3720000224 (EU VAT paid via Etsy)' + (cb.euro_consignment_cost ? ' · customs value ' + cb.euro_consignment_cost.formatted_value : '');
      else if (a.country === 'United Kingdom') tax = 'UK VAT paid via Etsy';
      else if (a.country === 'Norway') tax = 'Norway VOEC (VAT paid via Etsy)';
      else if (a.country === 'Switzerland') tax = 'Swiss VAT paid via Etsy';
      const notes = [o.notes && o.notes.note_from_buyer, ...((o.notes && o.notes.private_order_notes) || []).map(n => n.note || n.text || '')].filter(Boolean).join('\n');
      return {
        store, etsyOrderId: String(o.order_id), created: ts(o.order_date),
        productName: tx.map(t => (t.quantity > 1 ? t.quantity + '× ' : '') + dec(t.product && t.product.title)).join('\n'),
        productLink: [...new Set(tx.map(t => 'https://www.etsy.com/listing/' + t.listing_id))].join('\n'),
        variant: tx.map(t => (t.variations || []).map(v => dec(v.property) + ': ' + dec(v.value)).join(', ') + ((t.product && t.product.product_identifier) ? ' [SKU ' + t.product.product_identifier + ']' : '')).join('\n'),
        qty: tx.reduce((s, t) => s + (t.quantity || 0), 0),
        buyerName: dec(a.name),
        address: [a.name, a.first_line, a.second_line, [a.city, a.state, a.zip].filter(Boolean).join(' '), a.country, a.phone ? 'Tel: ' + a.phone : ''].filter(Boolean).map(dec).join('\n'),
        country: a.country || '', taxCode: tax,
        orderValue: [money(cb.discounted_items_cost || cb.items_cost) + ' items',
          nz(cb.shipping_cost) ? '+ ' + money(cb.shipping_cost) + ' shipping' : '',
          nz(cb.discount) ? '(list ' + money(cb.items_cost) + ', discount ' + money(cb.discount) + ')' : '',
          nz(cb.tax_cost) ? '· buyer paid ' + money(cb.buyer_cost) + ' incl. tax' : '',
          nz(cb.refund) ? '· REFUND ' + money(cb.refund) : ''].filter(Boolean).join(' '),
        shipBy: f.expected_ship_date ? ts(f.expected_ship_date).slice(0, 10) : '',
        gift: o.is_gift ? 'true' : 'false', giftNote: dec(o.gift_message || ''),
        special: notes,
        photos: tx.map(t => String(t.product && t.product.image_url_75x75 || '').replace('il_75x75.', 'il_570xN.')).filter(Boolean).join('\n'),
        status,
        agentNote: f.was_shipped ? 'Etsy: shipped' + (sum ? ' · ' + sum : '') : ''
      };
    });
  }

  /* ---------- one sync round ---------- */
  let busy = false, timer = null, nextAt = null;
  async function round(manual) {
    if (busy) return; busy = true;
    try {
      if (!w || w.closed) {
        w = manual ? window.open(HUB + '#etsy-sync', 'ohsync') : null;
        ready = false;
        if (!w) { say('⚠ Order Hub window is closed — click “Sync now” to reopen it.'); return; }
      }
      say('reading Etsy…');
      const recs = await readEtsy();
      if (!ready) say(recs.length + ' orders ready — log in to Order Hub (admin) in the other window…');
      await waitReady();
      w.postMessage({ type: 'oh-etsy', orders: recs }, HUB_ORIGIN);
      say(recs.length + ' orders sent, Order Hub is saving…');
    } catch (err) {
      say('⚠ ' + (err.message || err));
    } finally {
      busy = false;
      nextAt = new Date(Date.now() + EVERY_MIN * 60000);
      next('Auto-sync every ' + EVERY_MIN + ' min · next ' + hhmm(nextAt) + ' · keep this tab open');
    }
  }
  timer = setInterval(() => round(false), EVERY_MIN * 60000);
  window.__ohAuto = {
    now: m => round(m),
    stop: () => { clearInterval(timer); window.__ohAuto = null; say('Auto-sync stopped.'); next(''); setTimeout(() => box.remove(), 4000); }
  };
  box.querySelector('#__ohnow').onclick = () => round(true);
  box.querySelector('#__ohstop').onclick = () => window.__ohAuto && window.__ohAuto.stop();
  box.querySelector('#__ohmin').onclick = () => { const s = box.querySelector('#__ohs'), n = box.querySelector('#__ohn'); const hid = s.style.display === 'none'; s.style.display = n.style.display = hid ? '' : 'none'; };
  if (!w) say('⚠ Pop-up blocked: allow pop-ups for etsy.com, then click “Sync now”.');
  round(false);
})();

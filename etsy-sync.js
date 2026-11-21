(async () => {
  const HUB = 'https://satanxiety.github.io/order-hub/';
  const HUB_ORIGIN = 'https://satanxiety.github.io';
  if (!/(^|\.)etsy\.com$/.test(location.hostname)) { alert('Order Hub: use this button on an Etsy Shop Manager page (etsy.com/your/orders/sold).'); return; }
  const SH = { 68640007: 'Novelle', 69235788: 'Lumiva', 69236512: 'MiniBoutique' };
  const C = (window.Etsy && Etsy.Context && Etsy.Context.data) || {};
  const shop = C.shop_id || +((document.documentElement.innerHTML.match(/"shop_id"\s*:\s*"?(\d+)/) || [])[1] || 0);
  if (!shop) { alert('Order Hub: shop not found. Open Etsy Shop Manager > Orders first.'); return; }
  const store = SH[shop] || C.shop_name || String(shop);
  const w = window.open(HUB + '#etsy-sync', 'ohsync');
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;z-index:2147483647;top:16px;right:16px;background:#1f1b2e;color:#fff;padding:12px 16px;border-radius:12px;font:14px/1.4 -apple-system,Segoe UI,sans-serif;box-shadow:0 6px 24px #0006;max-width:340px;cursor:pointer';
  box.onclick = () => box.remove();
  document.body.appendChild(box);
  const say = t => { box.textContent = '📦 Order Hub · ' + store + ' — ' + t; };
  if (!w) { say('Popup blocked: allow pop-ups for etsy.com and click the bookmark again.'); return; }
  let ready = false, onReady = null;
  window.addEventListener('message', e => {
    if (e.origin !== HUB_ORIGIN) return;
    const d = e.data || {};
    if (d.type === 'oh-ready') { ready = true; if (onReady) onReady(); }
    else if (d.type === 'oh-res') {
      say(d.error ? ('ERROR: ' + d.error) : ('✓ ' + d.total + ' orders · ' + d.created + ' new · ' + d.updated + ' updated'));
      setTimeout(() => box.remove(), 20000);
    }
  });
  say('reading Etsy orders…');
  try {
    const base = '/api/v3/ajax/bespoke/shop/' + shop + '/mission-control/orders/data?filters%5Bbuyer_id%5D=all&filters%5Bchannel%5D=all&filters%5Bcompleted_status%5D=all&filters%5Bcompleted_date%5D=all&filters%5Bdestination%5D=all&filters%5Bship_date%5D=all&filters%5Bshipping_label_eligibility%5D=false&filters%5Bshipping_label_status%5D=all&filters%5Bhas_buyer_notes%5D=false&filters%5Bis_marked_as_gift%5D=false&filters%5Bis_personalized%5D=false&filters%5Bhas_shipping_upgrade%5D=false&filters%5Bmessage_status%5D=all&filters%5Border_state_id%5D=all&search_terms=&sort_by=order_date&sort_order=asc&objects_enabled_for_normalization%5Border_state%5D=true';
    let A = [], off = 0, total = 0;
    do {
      const r = (await (await fetch(base + '&limit=50&offset=' + off)).json()).orders_search;
      total = r.total_count; A.push(...r.orders); off += 50; if (!r.orders.length) break;
      say('reading Etsy orders… ' + A.length + '/' + total);
    } while (off < total);
    const EU = ['Austria','Belgium','Bulgaria','Croatia','Cyprus','Czech Republic','Czechia','Denmark','Estonia','Finland','France','Germany','Greece','Hungary','Ireland','Italy','Latvia','Lithuania','Luxembourg','Malta','Netherlands','The Netherlands','Poland','Portugal','Romania','Slovakia','Slovenia','Spain','Sweden'];
    const dec = s => { const t = document.createElement('textarea'); t.innerHTML = String(s || ''); return t.value; };
    const ts = x => x ? new Date((x < 1e12 ? x * 1000 : x)).toISOString() : '';
    const money = x => x && x.formatted_value ? x.formatted_value.replace('US$', '$') : '';
    const nz = x => x && x.value !== undefined ? +x.value > 0 : !!(x && /[1-9]/.test(x.formatted_value || ''));
    const recs = A.map(o => {
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
    let sent = false;
    const send = () => { if (sent) return; sent = true; w.postMessage({ type: 'oh-etsy', orders: recs }, HUB_ORIGIN); say(recs.length + ' orders sent, Order Hub is saving…'); };
    if (ready) send();
    else { say(recs.length + ' orders ready — log in to Order Hub (admin) in the opened window…'); onReady = send; }
  } catch (err) {
    say('ERROR reading Etsy: ' + (err.message || err));
  }
})();

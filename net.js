// طبقة الاتصال: Supabase Realtime لو موجود في config.js، وإلا BroadcastChannel (تجربة بين تبويبات نفس المتصفح).
// onStatus تنادي بـ 'up' كل ما انفتح الاتصال (أول مرة وبعد أي انقطاع)، و'down' لما ينقطع.
window.Net = {
  online() {
    const c = window.MAZAD_CONFIG || {};
    return !!(c.supabaseUrl && c.supabaseKey && window.supabase);
  },
  async open(room, onMsg, onStatus) {
    const name = 'mazad-' + room, status = onStatus || (() => {});
    if (this.online()) {
      const c = window.MAZAD_CONFIG;
      const client = window.supabase.createClient(c.supabaseUrl, c.supabaseKey, { realtime: { params: { eventsPerSecond: 20 } } });
      const ch = client.channel(name, { config: { broadcast: { self: false } } });
      ch.on('broadcast', { event: 'm' }, ({ payload }) => onMsg(payload));
      let first = true;
      await new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('timeout')), 10000);
        ch.subscribe(s => {
          if (s === 'SUBSCRIBED') { clearTimeout(t); if (first) { first = false; resolve(); } status('up'); }
          else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT' || s === 'CLOSED') status('down');
        });
      });
      return { send: m => ch.send({ type: 'broadcast', event: 'm', payload: m }), mode: 'online' };
    }
    const bc = new BroadcastChannel(name);
    bc.onmessage = e => onMsg(e.data);
    setTimeout(() => status('up'), 0);
    return { send: m => bc.postMessage(m), mode: 'local' };
  }
};

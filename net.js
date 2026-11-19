// طبقة الاتصال: Supabase Realtime لو موجود في config.js، وإلا BroadcastChannel (تجربة بين تبويبات نفس المتصفح).
window.Net = {
  online() {
    const c = window.MAZAD_CONFIG || {};
    return !!(c.supabaseUrl && c.supabaseKey && window.supabase);
  },
  async open(room, onMsg) {
    const name = 'mazad-' + room;
    if (this.online()) {
      const c = window.MAZAD_CONFIG;
      const client = window.supabase.createClient(c.supabaseUrl, c.supabaseKey);
      const ch = client.channel(name, { config: { broadcast: { self: false } } });
      ch.on('broadcast', { event: 'm' }, ({ payload }) => onMsg(payload));
      await new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('timeout')), 10000);
        ch.subscribe(s => { if (s === 'SUBSCRIBED') { clearTimeout(t); resolve(); } });
      });
      return { send: m => ch.send({ type: 'broadcast', event: 'm', payload: m }), mode: 'online' };
    }
    const bc = new BroadcastChannel(name);
    bc.onmessage = e => onMsg(e.data);
    return { send: m => bc.postMessage(m), mode: 'local' };
  }
};

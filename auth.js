// هوية كل جوال: مفتاح خاص يبقى في الجوال، ومفتاح عام ينرسل للشاشة.
// كل رهان أو جواب ينوقّع، والشاشة ترفض أي رسالة توقيعها غلط أو مكررة.
// القناة عامة، فأي أحد يقدر يشوف الرسائل، بس ما يقدر يزوّرها.
(function (root, factory) {
  const A = factory();
  if (typeof module === 'object' && module.exports) module.exports = A;
  else root.Auth = A;
})(typeof self !== 'undefined' ? self : this, function () {
  const subtle = () => (globalThis.crypto && globalThis.crypto.subtle) || null;
  const ALG = { name: 'ECDSA', namedCurve: 'P-256' };
  const SIG = { name: 'ECDSA', hash: 'SHA-256' };
  const enc = s => new TextEncoder().encode(s);
  const b64 = buf => { let s = ''; new Uint8Array(buf).forEach(b => s += String.fromCharCode(b)); return btoa(s); };
  const unb64 = str => Uint8Array.from(atob(str), c => c.charCodeAt(0));
  const hex = buf => Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  const canon = parts => JSON.stringify(parts);

  function available() { return !!subtle(); }

  async function idFromPub(pub) {
    if (!pub || typeof pub.x !== 'string' || typeof pub.y !== 'string') throw new Error('مفتاح غير صالح');
    return hex(await subtle().digest('SHA-256', enc(pub.x + '.' + pub.y))).slice(0, 16);
  }

  async function createIdentity() {
    const kp = await subtle().generateKey(ALG, true, ['sign', 'verify']);
    const pub = await subtle().exportKey('jwk', kp.publicKey);
    const priv = await subtle().exportKey('jwk', kp.privateKey);
    const slim = { kty: pub.kty, crv: pub.crv, x: pub.x, y: pub.y };
    return { id: await idFromPub(slim), pub: slim, priv };
  }

  async function signer(identity) {
    const key = await subtle().importKey('jwk', identity.priv, ALG, false, ['sign']);
    return async parts => b64(await subtle().sign(SIG, key, enc(canon(parts))));
  }

  const pubCache = new Map();
  async function verify(pub, parts, sig) {
    try {
      const k = pub.x + '.' + pub.y;
      let key = pubCache.get(k);
      if (!key) { key = await subtle().importKey('jwk', { kty: 'EC', crv: 'P-256', x: pub.x, y: pub.y }, ALG, false, ['verify']); pubCache.set(k, key); }
      return await subtle().verify(SIG, key, unb64(sig), enc(canon(parts)));
    } catch (e) { return false; }
  }

  // أجزاء الرسائل الموقّعة: نفس الترتيب في الجوال والشاشة
  const joinParts = m => ['join', m.room, m.id, m.name, m.team];
  const actParts = m => ['act', m.room, m.id, m.seq, m.body];

  return { available, createIdentity, signer, verify, idFromPub, joinParts, actParts };
});

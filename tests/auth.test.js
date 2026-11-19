const test = require('node:test');
const assert = require('node:assert/strict');
const A = require('../auth.js');

test('التوقيع الصحيح ينقبل', async () => {
  const me = await A.createIdentity(); const sign = await A.signer(me);
  const m = { room: 'K7Q2X', id: me.id, seq: 5, body: { type: 'bid', team: 0, amount: 300 } };
  m.sig = await sign(A.actParts(m));
  assert.equal(await A.verify(me.pub, A.actParts(m), m.sig), true);
});

test('تغيير ترتيب المفاتيح في الطريق ما يكسر التوقيع', async () => {
  const me = await A.createIdentity(); const sign = await A.signer(me);
  const m = { room: 'K7Q2X', id: me.id, seq: 9, body: { type: 'bid', amount: 300, allin: false } };
  const sig = await sign(A.actParts(m));
  const reordered = { ...m, body: { allin: false, amount: 300, type: 'bid' } };
  assert.equal(await A.verify(me.pub, A.actParts(reordered), sig), true);
});

test('أي تعديل على الرسالة يكسر التوقيع', async () => {
  const me = await A.createIdentity(); const sign = await A.signer(me);
  const m = { room: 'K7Q2X', id: me.id, seq: 5, body: { type: 'bid', team: 0, amount: 300 } };
  const sig = await sign(A.actParts(m));
  for (const bad of [{ ...m, seq: 6 }, { ...m, room: 'AAAAA' }, { ...m, body: { type: 'bid', team: 1, amount: 300 } }, { ...m, body: { type: 'bid', team: 0, amount: 999 } }])
    assert.equal(await A.verify(me.pub, A.actParts(bad), sig), false);
});

test('ما تقدر توقّع باسم جوال ثاني', async () => {
  const me = await A.createIdentity(), them = await A.createIdentity();
  const m = { room: 'K7Q2X', id: them.id, seq: 1, body: { type: 'answer', k: 2 } };
  const sig = await (await A.signer(me))(A.actParts(m));
  assert.equal(await A.verify(them.pub, A.actParts(m), sig), false);
});

test('المعرّف مشتق من المفتاح العام وثابت', async () => {
  const me = await A.createIdentity();
  assert.equal(await A.idFromPub(me.pub), me.id);
  assert.match(me.id, /^[0-9a-f]{16}$/);
});

test('توقيع خربان أو مفتاح ناقص ما يطيّح الشاشة', async () => {
  const me = await A.createIdentity();
  assert.equal(await A.verify(me.pub, ['x'], 'not-base64!!'), false);
  assert.equal(await A.verify({}, ['x'], 'AAAA'), false);
});

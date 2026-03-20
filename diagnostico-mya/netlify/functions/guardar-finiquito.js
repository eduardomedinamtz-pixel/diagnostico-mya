const { getStore } = require('@netlify/blobs');

exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let data;
  try {
    data = JSON.parse(event.body);
  } catch(e) {
    return { statusCode: 400, body: 'Invalid JSON' };
  }

  try {
    const store = getStore('finiquitos');
    const id = 'finq_' + Date.now();
    await store.setJSON(id, {
      id,
      tipo: 'finiquito',
      fecha: new Date().toISOString(),
      trabajador:   data.trabajador   || '—',
      patron:       data.patron       || '—',
      ingreso:      data.ingreso      || '—',
      baja:         data.baja         || '—',
      causa:        data.causa        || '—',
      sd:           data.sd           || 0,
      sdi:          data.sdi          || 0,
      fi:           data.fi           || 0,
      anos:         data.anos         || 0,
      meses:        data.meses        || 0,
      dias:         data.dias         || 0,
      finiqSub:     data.finiqSub     || 0,
      indemSub:     data.indemSub     || 0,
      gratSub:      data.gratSub      || 0,
      grandTotal:   data.grandTotal   || 0,
      exentoISR:    data.exentoISR    || 0,
      gravableISR:  data.gravableISR  || 0,
    });
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true, id }),
    };
  } catch(e) {
    console.error('Error guardando finiquito:', e);
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};

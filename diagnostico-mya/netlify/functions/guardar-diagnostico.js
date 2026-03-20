const { getStore } = require('@netlify/blobs');

exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let body;
  try {
    const params = new URLSearchParams(event.body);
    body = {};
    for (const [k, v] of params.entries()) {
      body[k] = body[k] ? body[k] + ', ' + v : v;
    }
  } catch(e) {
    return { statusCode: 400, body: 'Error parsing data' };
  }

  if (body['bot-field']) return { statusCode: 200, body: 'OK' };

  try {
    const store = getStore('diagnosticos');
    const id = 'diag_' + Date.now();
    await store.setJSON(id, {
      id,
      tipo: 'diagnostico',
      fecha: new Date().toISOString(),
      empresa: body.empresa || '—',
      responsable: body.responsable || '—',
      telefono: body.telefono || '—',
      correo: body.correo || '—',
      num_trabajadores: body.num_trabajadores || '—',
      giro: body.giro || '—',
      causa: body.causa || '1',
      demanda_laboral: body.demanda_laboral || '—',
      cumplimiento_laboral: body.cumplimiento_laboral || '—',
      urgencia_privacidad: body.urgencia_privacidad || '—',
      contratos: body.contratos || '—',
      imss_real: body.imss_real || '—',
      aviso_privacidad: body.aviso_privacidad || '—',
      preocupacion: body.preocupacion_principal || '—',
      preferencia_contacto: body.preferencia_contacto || '—',
      datos_raw: body,
    });
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true, id }),
    };
  } catch(e) {
    console.error('Error guardando en Blobs:', e);
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};

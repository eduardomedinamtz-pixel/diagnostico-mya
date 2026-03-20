const { getStore } = require('@netlify/blobs');

const PASSWORD = 'carrier23';

exports.handler = async function(event) {
  // Verificar contraseña
  const auth = event.queryStringParameters && event.queryStringParameters.pwd;
  if (auth !== PASSWORD) {
    return {
      statusCode: 401,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'No autorizado' }),
    };
  }

  const tipo = (event.queryStringParameters && event.queryStringParameters.tipo) || 'todos';

  try {
    const registros = [];

    if (tipo === 'todos' || tipo === 'diagnosticos') {
      const storeD = getStore('diagnosticos');
      const { blobs: blobsD } = await storeD.list();
      for (const b of blobsD) {
        try {
          const data = await storeD.get(b.key, { type: 'json' });
          if (data) registros.push(data);
        } catch(e) { /* skip */ }
      }
    }

    if (tipo === 'todos' || tipo === 'finiquitos') {
      const storeF = getStore('finiquitos');
      const { blobs: blobsF } = await storeF.list();
      for (const b of blobsF) {
        try {
          const data = await storeF.get(b.key, { type: 'json' });
          if (data) registros.push(data);
        } catch(e) { /* skip */ }
      }
    }

    // Ordenar por fecha descendente
    registros.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true, total: registros.length, registros }),
    };
  } catch(e) {
    console.error('Error listando registros:', e);
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};

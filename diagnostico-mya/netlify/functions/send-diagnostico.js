const nodemailer = require('nodemailer');
const { getStore } = require('@netlify/blobs');

// ── Configuración SMTP iCloud ─────────────────────────────
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_PASS,
  },
});

// ── Helpers ───────────────────────────────────────────────
function badge(nivel) {
  const map = {
    ALTO:  { bg: '#FFE7E7', color: '#C00000', label: '🔴 RIESGO ALTO' },
    MEDIO: { bg: '#FFF3E0', color: '#C55A00', label: '🟡 RIESGO MEDIO' },
    BAJO:  { bg: '#EDF7ED', color: '#375623', label: '🟢 RIESGO BAJO' },
  };
  const c = map[nivel] || { bg: '#F0F0F0', color: '#667587', label: 'ℹ️ INFO' };
  return `<span style="background:${c.bg};color:${c.color};font-weight:700;font-size:11px;
    padding:3px 8px;border-radius:4px;white-space:nowrap">${c.label}</span>`;
}

function evalRiesgo(body) {
  const alertas = [];

  // Contratos
  if ((body.contratos || '').includes('Sin contrato escrito'))
    alertas.push({ campo: 'Contratos', riesgo: 'ALTO', msg: 'Sin contrato escrito — Art. 25 LFT' });
  if (body.contratos_actualizados === 'No' || body.contratos_actualizados === 'No sé')
    alertas.push({ campo: 'Contratos reforma 2021', riesgo: 'ALTO', msg: 'Contratos no actualizados — Arts. 12-15-D LFT' });
  if (body.rit === 'No')
    alertas.push({ campo: 'Reglamento Interior', riesgo: 'MEDIO', msg: 'Sin RIT registrado ante STPS — Art. 425 LFT' });

  // Nómina
  if ((body.prestaciones || '').includes('No tengo claridad'))
    alertas.push({ campo: 'Prestaciones', riesgo: 'ALTO', msg: 'Sin claridad en cálculo de prestaciones — Arts. 76, 80, 87 LFT' });
  if (body.vacaciones_control === 'Sin control formal')
    alertas.push({ campo: 'Vacaciones', riesgo: 'ALTO', msg: 'Sin registro de vacaciones — Art. 516 LFT' });

  // IMSS
  if (body.imss_real === 'Solo algunos' || body.imss_real === 'No' || body.imss_real === 'No sé')
    alertas.push({ campo: 'IMSS', riesgo: 'ALTO', msg: 'Posible subregistro IMSS — Art. 15 LIMSS' });
  if ((body.stps || '').includes('Ninguna'))
    alertas.push({ campo: 'Obligaciones STPS', riesgo: 'ALTO', msg: 'Sin ninguna obligación STPS cumplida — NOM-035, Art. 994 LFT' });
  else if (!(body.stps || '').includes('NOM-035'))
    alertas.push({ campo: 'NOM-035', riesgo: 'ALTO', msg: 'NOM-035 no implementada — obligatoria desde 2020' });

  // Privacidad
  if (body.aviso_privacidad === 'No')
    alertas.push({ campo: 'Aviso de Privacidad', riesgo: 'ALTO', msg: 'Sin aviso de privacidad — Art. 16 LFPDPPP, multa hasta $32M' });
  if (body.aviso_privacidad === 'Sí, pero incompleto')
    alertas.push({ campo: 'Aviso de Privacidad', riesgo: 'MEDIO', msg: 'Aviso incompleto — revisar Art. 16 LFPDPPP' });
  if ((body.datos_personales || '').includes('sensibles'))
    alertas.push({ campo: 'Datos sensibles', riesgo: 'ALTO', msg: 'Maneja datos sensibles sin consentimiento expreso — Art. 9 LFPDPPP' });

  // Antecedentes
  if (body.antecedentes_demandas && body.antecedentes_demandas !== 'No')
    alertas.push({ campo: 'Antecedentes', riesgo: 'MEDIO', msg: `${body.antecedentes_demandas} en últimos 3 años` });

  return alertas;
}

function escala(val) {
  if (!val) return '—';
  const n = parseInt(val);
  const bars = Array.from({length: 5}, (_, i) =>
    `<span style="display:inline-block;width:14px;height:14px;border-radius:3px;margin:0 1px;
      background:${i < n ? '#004AC7' : '#DCE3ED'}"></span>`
  ).join('');
  return `${bars} <strong style="color:#051226">${n}/5</strong>`;
}

// ── Construir HTML del correo ─────────────────────────────
function buildHTML(body) {
  const alertas = evalRiesgo(body);
  const altosCount  = alertas.filter(a => a.riesgo === 'ALTO').length;
  const mediosCount = alertas.filter(a => a.riesgo === 'MEDIO').length;
  const fecha = new Date().toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' });

  const colorUrgencia = altosCount >= 3 ? '#C00000' : altosCount >= 1 ? '#C55A00' : '#375623';
  const labelUrgencia = altosCount >= 3 ? '⚠️ URGENCIA ALTA — Contactar en < 24 hrs'
                      : altosCount >= 1 ? '⚡ URGENCIA MEDIA — Contactar en < 48 hrs'
                      : '✅ URGENCIA NORMAL';

  const alertasHTML = alertas.length > 0
    ? alertas.map(a => `
        <tr>
          <td style="padding:7px 12px;border-bottom:1px solid #E8EDF4;font-family:Arial,sans-serif;font-size:12px;color:#374151">${a.campo}</td>
          <td style="padding:7px 12px;border-bottom:1px solid #E8EDF4;font-family:Arial,sans-serif;font-size:12px">${badge(a.riesgo)}</td>
          <td style="padding:7px 12px;border-bottom:1px solid #E8EDF4;font-family:Arial,sans-serif;font-size:12px;color:#374151">${a.msg}</td>
        </tr>`).join('')
    : `<tr><td colspan="3" style="padding:10px 12px;font-family:Arial,sans-serif;font-size:12px;color:#375623;font-style:italic">
        Sin alertas detectadas — cumplimiento general adecuado.</td></tr>`;

  function fila(label, value) {
    if (!value) return '';
    return `<tr>
      <td style="padding:5px 10px;font-family:Arial,sans-serif;font-size:11px;color:#667587;width:200px;vertical-align:top">${label}</td>
      <td style="padding:5px 10px;font-family:Arial,sans-serif;font-size:12px;color:#111;font-weight:600;vertical-align:top">${value}</td>
    </tr>`;
  }

  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#F4F7FB;font-family:Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F4F7FB;padding:20px 0">
<tr><td align="center">
<table width="620" cellpadding="0" cellspacing="0" style="max-width:620px;width:100%">

  <!-- HEADER -->
  <tr><td style="background:linear-gradient(135deg,#051226 0%,#004AC7 100%);padding:20px 24px;border-radius:10px 10px 0 0">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td>
          <div style="font-family:Georgia,serif;font-size:18px;color:#F0F0F0;font-weight:400">Diagnóstico de Cumplimiento Laboral</div>
          <div style="font-size:11px;color:rgba(240,240,240,0.7);margin-top:3px">${fecha}</div>
        </td>
        <td align="right">
          <div style="font-family:Georgia,serif;font-size:13px;color:#F0F0F0">Medina &amp; Alatorre</div>
          <div style="font-size:9px;letter-spacing:2px;text-transform:uppercase;color:rgba(240,240,240,0.5);margin-top:2px">ABOGADOS</div>
        </td>
      </tr>
    </table>
  </td></tr>

  <!-- URGENCIA BANNER -->
  <tr><td style="background:${colorUrgencia};padding:10px 24px">
    <span style="font-family:Arial,sans-serif;font-size:13px;font-weight:700;color:#FFFFFF">${labelUrgencia}</span>
    <span style="font-family:Arial,sans-serif;font-size:12px;color:rgba(255,255,255,0.85);margin-left:12px">
      ${altosCount} riesgo(s) alto(s) · ${mediosCount} medio(s)</span>
  </td></tr>

  <!-- EMPRESA DESTACADA -->
  <tr><td style="background:#E8F0FD;border-left:4px solid #004AC7;padding:12px 20px">
    <div style="font-size:10px;color:#667587;font-family:Arial,sans-serif">Empresa</div>
    <div style="font-family:Georgia,serif;font-size:20px;color:#051226">${body.empresa || '—'}</div>
    <div style="font-size:12px;color:#374151;font-family:Arial,sans-serif;margin-top:2px">
      ${body.responsable || '—'} · ${body.cargo || ''} · ${body.telefono || '—'}
    </div>
  </td></tr>

  <!-- ALERTAS PRINCIPALES -->
  <tr><td style="background:#FFFFFF;padding:16px 20px">
    <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#004AC7;
      border-bottom:2px solid #004AC7;padding-bottom:4px;margin-bottom:10px">
      Alertas detectadas automáticamente
    </div>
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr style="background:#F1F5F9">
        <th style="padding:6px 12px;text-align:left;font-size:10px;color:#4B5563;font-weight:700">Campo</th>
        <th style="padding:6px 12px;text-align:left;font-size:10px;color:#4B5563;font-weight:700">Nivel</th>
        <th style="padding:6px 12px;text-align:left;font-size:10px;color:#4B5563;font-weight:700">Implicación</th>
      </tr>
      ${alertasHTML}
    </table>
  </td></tr>

  <!-- PERCEPCIÓN DE RIESGO -->
  <tr><td style="background:#FAFBFC;padding:14px 20px;border-top:1px solid #E8EDF4">
    <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#004AC7;
      border-bottom:2px solid #004AC7;padding-bottom:4px;margin-bottom:10px">
      Percepción de riesgo (escala 1–5)
    </div>
    <table cellpadding="0" cellspacing="0">
      <tr><td style="padding:4px 0;font-size:12px;color:#374151;font-family:Arial,sans-serif;width:260px">Probabilidad de demanda laboral</td>
          <td style="padding:4px 8px">${escala(body.demanda_laboral)}</td></tr>
      <tr><td style="padding:4px 0;font-size:12px;color:#374151;font-family:Arial,sans-serif">Nivel de cumplimiento laboral</td>
          <td style="padding:4px 8px">${escala(body.cumplimiento_laboral)}</td></tr>
      <tr><td style="padding:4px 0;font-size:12px;color:#374151;font-family:Arial,sans-serif">Urgencia en protección de datos</td>
          <td style="padding:4px 8px">${escala(body.urgencia_privacidad)}</td></tr>
    </table>
  </td></tr>

  <!-- DATOS COMPLETOS -->
  <tr><td style="background:#FFFFFF;padding:14px 20px;border-top:1px solid #E8EDF4">
    <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#004AC7;
      border-bottom:2px solid #004AC7;padding-bottom:4px;margin-bottom:10px">
      Datos completos del diagnóstico
    </div>
    <table width="100%" cellpadding="0" cellspacing="0">
      ${fila('Giro / Actividad', body.giro)}
      ${fila('Núm. trabajadores', body.num_trabajadores)}
      ${fila('Años de operación', body.anos_operacion)}
      ${fila('Área de RRHH', body.area_rrhh)}
      ${fila('Tipos de contrato', body.contratos)}
      ${fila('Contratos actualizados', body.contratos_actualizados)}
      ${fila('Reglamento Interior', body.rit)}
      ${fila('Prestaciones', body.prestaciones)}
      ${fila('Jornada reducida', body.jornada_reducida)}
      ${fila('Control vacaciones', body.vacaciones_control)}
      ${fila('IMSS salario real', body.imss_real)}
      ${fila('Obligaciones STPS', body.stps)}
      ${fila('Aviso de Privacidad', body.aviso_privacidad)}
      ${fila('Datos personales', body.datos_personales)}
      ${fila('Antecedentes', body.antecedentes_demandas)}
      ${fila('Preferencia contacto', body.preferencia_contacto)}
      ${fila('Ciudad / Estado', body.ciudad)}
      ${fila('Correo cliente', body.correo)}
    </table>
    ${body.preocupacion_principal ? `
    <div style="margin-top:12px;background:#F8FAFC;border-left:3px solid #004AC7;padding:10px 14px;border-radius:4px">
      <div style="font-size:10px;color:#667587;font-family:Arial,sans-serif;margin-bottom:4px">Preocupación principal (texto libre)</div>
      <div style="font-size:12px;color:#111;font-family:Arial,sans-serif;line-height:1.5;font-style:italic">"${body.preocupacion_principal}"</div>
    </div>` : ''}
  </td></tr>

  <!-- PIE -->
  <tr><td style="background:#051226;padding:14px 20px;border-radius:0 0 10px 10px">
    <div style="font-size:10px;color:rgba(240,240,240,0.6);font-family:Arial,sans-serif;text-align:center;line-height:1.6">
      Medina &amp; Alatorre Abogados · Av. Américas 1501, Piso 20-A · Guadalajara, Jalisco<br/>
      Cel: 33 1150 6374 · contacto@abogadosmya.com
    </div>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

// ── Handler principal ─────────────────────────────────────
exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let body;
  try {
    const params = new URLSearchParams(event.body);
    body = {};
    for (const [k, v] of params.entries()) {
      if (body[k]) {
        body[k] = body[k] + ', ' + v;
      } else {
        body[k] = v;
      }
    }
  } catch (e) {
    return { statusCode: 400, body: 'Error parsing form data' };
  }

  // Honeypot anti-spam
  if (body['bot-field']) {
    return { statusCode: 200, body: 'OK' };
  }

  const html = buildHTML(body);
  const empresa = body.empresa || 'Sin nombre';
  const alertas = evalRiesgo(body);
  const altos = alertas.filter(a => a.riesgo === 'ALTO').length;
  const asunto = altos >= 3
    ? `⚠️ URGENTE — Diagnóstico: ${empresa} (${altos} riesgos altos)`
    : altos >= 1
    ? `⚡ Nuevo Diagnóstico — ${empresa} (${altos} riesgo${altos > 1 ? 's' : ''} alto${altos > 1 ? 's' : ''})`
    : `✅ Nuevo Diagnóstico — ${empresa}`;

  try {
    // Versión texto plano como fallback para clientes que no renderizan HTML
    const alertas2 = evalRiesgo(body);
    const textPlano = [
      '=== DIAGNÓSTICO LABORAL — MEDINA & ALATORRE ===',
      `Empresa: ${body.empresa || '—'}`,
      `Responsable: ${body.responsable || '—'} | ${body.cargo || ''}`,
      `Teléfono: ${body.telefono || '—'} | Correo: ${body.correo || '—'}`,
      `Ciudad: ${body.ciudad || '—'}`,
      '',
      '--- ALERTAS DETECTADAS ---',
      ...alertas2.map(a => `[${a.riesgo}] ${a.campo}: ${a.msg}`),
      '',
      '--- PERCEPCIÓN DE RIESGO ---',
      `Demanda laboral: ${body.demanda_laboral || '—'}/5`,
      `Cumplimiento laboral: ${body.cumplimiento_laboral || '—'}/5`,
      `Urgencia privacidad: ${body.urgencia_privacidad || '—'}/5`,
      '',
      '--- PREOCUPACIÓN PRINCIPAL ---',
      body.preocupacion_principal || '—',
      '',
      '--- PREFERENCIA DE CONTACTO ---',
      body.preferencia_contacto || '—',
      '',
      'Medina & Alatorre Abogados | Cel: 33 1150 6374 | contacto@abogadosmya.com',
    ].join('\n');

    await transporter.sendMail({
      from: `"Diagnóstico MYA" <${process.env.GMAIL_USER}>`,
      to: 'contacto@abogadosmya.com',
      subject: asunto,
      text: textPlano,
      html: html,
      headers: {
        'Content-Type': 'text/html; charset=UTF-8',
        'MIME-Version': '1.0',
      },
      replyTo: body.correo || process.env.GMAIL_USER,
    });
    // Guardar en Netlify Blobs
    try {
      const store = getStore('diagnosticos');
      const id = 'diag_' + Date.now();
      await store.setJSON(id, {
        id, tipo: 'diagnostico',
        fecha: new Date().toISOString(),
        empresa: body.empresa || '—',
        responsable: body.responsable || '—',
        telefono: body.telefono || '—',
        correo: body.correo || '—',
        num_trabajadores: body.num_trabajadores || '—',
        giro: body.giro || '—',
        demanda_laboral: body.demanda_laboral || '—',
        cumplimiento_laboral: body.cumplimiento_laboral || '—',
        urgencia_privacidad: body.urgencia_privacidad || '—',
        contratos: body.contratos || '—',
        imss_real: body.imss_real || '—',
        aviso_privacidad: body.aviso_privacidad || '—',
        preocupacion: body.preocupacion_principal || '—',
        preferencia_contacto: body.preferencia_contacto || '—',
      });
    } catch(blobErr) {
      console.error('Error guardando en Blobs (no crítico):', blobErr.message);
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true }),
    };
  } catch (err) {
    console.error('Error enviando correo:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};

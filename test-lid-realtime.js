const https = require('https');

function apiCall(path, method, body) {
  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : null;
    const options = {
      hostname: 'evolutionapi.autyvia.fr',
      path,
      method,
      headers: {
        'apikey': '!Arcaykest82',
        'Content-Type': 'application/json',
        ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {}),
      },
    };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, data }); }
      });
    });
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

async function main() {
  const instanceName = 'wa-d46aa07e-1769993339442';
  // The message ID from the logs just now
  const messageId = '3BC6AF026CADCE6ADBD3';

  // Step 1: Find the message to get the LID
  console.log('=== Step 1: findMessages ===');
  const r1 = await apiCall(`/chat/findMessages/${instanceName}`, 'POST', {
    where: { key: { id: messageId } }
  });
  console.log('Total:', r1.data?.messages?.total);

  if (r1.data?.messages?.records?.length > 0) {
    const stored = r1.data.messages.records[0];
    const lidJid = stored.key.remoteJid;
    console.log('LID JID:', lidJid);

    // Step 2: Try getBase64 with LID
    console.log('\n=== Step 2: getBase64 with LID ===');
    const r2 = await apiCall(`/chat/getBase64FromMediaMessage/${instanceName}`, 'POST', {
      message: { key: { remoteJid: lidJid, id: messageId } }
    });
    console.log('Status:', r2.status);
    console.log('base64 length:', (r2.data?.base64 || '').length);
    if (r2.data?.base64?.length > 0) {
      console.log('SUCCESS with LID!');
    } else {
      console.log('EMPTY with LID too');
      console.log('Response:', JSON.stringify(r2.data).substring(0, 300));
    }

    // Step 3: Try with @s.whatsapp.net for comparison
    console.log('\n=== Step 3: getBase64 with @s.whatsapp.net ===');
    const r3 = await apiCall(`/chat/getBase64FromMediaMessage/${instanceName}`, 'POST', {
      message: { key: { remoteJid: '32493851479@s.whatsapp.net', id: messageId } }
    });
    console.log('Status:', r3.status);
    console.log('base64 length:', (r3.data?.base64 || '').length);
    if (r3.data?.base64?.length > 0) {
      console.log('SUCCESS with @s.whatsapp.net!');
    } else {
      console.log('EMPTY with @s.whatsapp.net');
    }
  } else {
    console.log('Message not found in store');
  }
}

main().catch(console.error);

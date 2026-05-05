const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcodeImg = require('qrcode');
const { Pool } = require('pg');
const http = require('http');

// ===================== PROTECCIÓN =====================
process.on('unhandledRejection', error => console.log('⚠️ Promesa:', error));
process.on('uncaughtException', error => console.log('💥 Error:', error));

// ===================== BASE DE DATOS =====================
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// ===================== CONFIG =====================
let qrGenerado = false;

const client = new Client({
    authStrategy: new LocalAuth({
        clientId: 'cine-bot-v2',
        dataPath: './.wwebjs_auth' // importante
    }),
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--no-zygote',
            '--single-process'
        ]
    },
    authTimeoutMs: 120000,
    takeoverOnConflict: true,
    takeoverTimeoutMs: 0
});

let sesiones = {};
let htmlContenido = "<h2 style='text-align:center;'>Cargando...</h2>";
const numeroDelBot = '50664797833';
const port = process.env.PORT || 10000;

// ===================== EVENTOS =====================

client.on('qr', async (qr) => {
    if (qrGenerado) return; // 🔥 evita regenerar QR cada rato

    try {
        console.log("📸 Generando QR...");
        const qrImage = await qrcodeImg.toDataURL(qr);

        htmlContenido = `
            <div style="text-align:center;">
                <h2>Escanea el QR</h2>
                <img src="${qrImage}" width="300"/>
            </div>`;

        qrGenerado = true;

    } catch (e) {
        console.log("Error QR:", e.message);
    }
});

client.on('authenticated', () => {
    console.log('✅ Autenticado');
    qrGenerado = true;
});

client.on('ready', () => {
    console.log('🚀 Bot listo');
    htmlContenido = <h1 style="text-align:center;color:green;">BOT ONLINE</h1>;
});

client.on('disconnected', (reason) => {
    console.log('❌ Desconectado:', reason);
    qrGenerado = false;
    client.initialize(); // 🔁 reconexión automática
});

// ===================== MENSAJES =====================

client.on('message', async msg => {
    try {
        if (!msg.body) return;

        const chat = msg.body.toLowerCase().trim();
        let fone = msg.from.split('@')[0];

        if (['hola', 'menu'].includes(chat)) {
            delete sesiones[fone];
            return msg.reply('Menú:\n1. Ver películas');
        }

        if (chat === '1') {
            const res = await pool.query('SELECT * FROM peliculas');

            let txt = 'Cartelera:\n\n';
            res.rows.forEach(p => {
                txt += ID ${p.id} - ${p.titulo}\n;
            });

            return msg.reply(txt);
        }

    } catch (e) {
        console.log("ERROR:", e.message);
    }
});

// ===================== INICIO =====================

client.initialize();

// ===================== SERVIDOR =====================

http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(htmlContenido);
}).listen(port, () => {
    console.log(🌐 Server en puerto ${port});
});

// ===================== KEEP ALIVE =====================
// evita que Render duerma el servicio
setInterval(() => {
    console.log("🔄 Keep alive");
}, 300000);
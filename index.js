const { Client, LocalAuth } = require('whatsapp-web.js');
const { Pool } = require('pg');
const http = require('http');

let htmlContenido = "<h2>⚙️ Motor iniciando... mira la consola de Render para el QR.</h2>";

const pool = new Pool({
    connectionString: process.env.DATABASE_URL, 
    ssl: { rejectUnauthorized: false }
});

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
    }
});

let sesiones = {};

// --- 🌟 EL SÚPER TRUCO DEL ENLACE QR ---
client.on('qr', (qr) => {
    // Esto convierte los datos del QR en un enlace de imagen
    const enlaceQR = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(qr)}`;
    
    console.log('\n=========================================');
    console.log('📲 HAZ CLIC EN ESTE ENLACE PARA VER TU CÓDIGO QR:');
    console.log(enlaceQR);
    console.log('=========================================\n');
});

client.on('ready', () => { 
    console.log('✅ Bot en la NUBE listo y conectado.'); 
    htmlContenido = "<h1>✅ Bot Conectado y Funcionando</h1>";
});

// --- LÓGICA BÁSICA PARA PROBAR ---
client.on('message', async msg => {
    try {
        const chat = msg.body.toLowerCase().trim();
        const fone = msg.from.split('@')[0];

        if (chat === 'reset') {
            delete sesiones[fone];
            msg.reply('🔄 Sesión reiniciada. Di "Hola" para empezar.');
            return;
        }

        if (chat === '*admin*') {
            sesiones[fone] = { paso: 'menu_admin' };
            msg.reply('🛠️ *MODO ADMIN*\n1. Agregar Película\n2. Ver Películas');
            return;
        }

        if (sesiones[fone]?.paso === 'menu_admin') {
            if (chat === '1') { sesiones[fone].paso = 'admin_titulo'; msg.reply('🎬 Título de la película:'); }
            else if (chat === '2') {
                const r = await pool.query('SELECT id, titulo FROM peliculas');
                let l = '🎬 Películas registradas:\n'; r.rows.forEach(p => l += `${p.id} - ${p.titulo}\n`);
                msg.reply(l); delete sesiones[fone];
            }
            return;
        }

        if (sesiones[fone]?.paso === 'admin_titulo') { sesiones[fone].titulo = msg.body; sesiones[fone].paso = 'admin_horario'; msg.reply('⏰ Horario (Ej: 7:00 PM):'); return; }
        if (sesiones[fone]?.paso === 'admin_horario') { sesiones[fone].horario = msg.body; sesiones[fone].paso = 'admin_cupos'; msg.reply('🪑 Cupos totales:'); return; }
        if (sesiones[fone]?.paso === 'admin_cupos') {
            await pool.query('INSERT INTO peliculas (titulo, horario, cupo_total, cupos_disponibles) VALUES ($1,$2,$3,$4)', [sesiones[fone].titulo, sesiones[fone].horario, parseInt(chat), parseInt(chat)]);
            msg.reply('✅ Película agregada a la base de datos.'); delete sesiones[fone]; return;
        }

        if (['hola', 'menu', 'inicio'].includes(chat)) {
            delete sesiones[fone];
            msg.reply('🍿 *Bienvenido a La Fábrica de los Sueños*\n\n1. 🎟️ Ver cartelera y Reservar\n2. 📍 Ubicación');
            return;
        }

        if (chat === '1') {
            const res = await pool.query('SELECT * FROM peliculas WHERE cupos_disponibles > 0');
            if (res.rows.length === 0) return msg.reply('⚠️ No hay funciones registradas aún.');
            let l = '🎬 *Cartelera:*\n\n';
            res.rows.forEach(p => l += `ID: *${p.id}* - ${p.titulo} (${p.horario})\n`);
            msg.reply(l + '\nEnvía el número de *ID* para reservar:');
            sesiones[fone] = { paso: 'eligiendo_pelicula' };
            return;
        }

        if (sesiones[fone]?.paso === 'eligiendo_pelicula') {
            msg.reply('✅ Excelente, ¡tu lugar está reservado! (Modo de prueba)');
            delete sesiones[fone];
        }

    } catch (e) { 
        console.log(e);
        msg.reply('❌ Ups, hubo un error de base de datos.');
    }
});

client.initialize();
http.createServer((req, res) => { res.writeHead(200, {'Content-Type': 'text/html'}); res.write(htmlContenido); res.end(); }).listen(process.env.PORT || 8080);
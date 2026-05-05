const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcodeImg = require('qrcode');
const { Pool } = require('pg');
const http = require('http');

// --- 🛡️ ESCUDOS DE SEGURIDAD ---
process.on('unhandledRejection', error => { console.log('⚠️ Promesa ignorada:', error.message); });
process.on('uncaughtException', error => { console.log('💥 ERROR EVITADO:', error.message); });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL, 
    ssl: { rejectUnauthorized: false }
});

// --- 🚀 NAVEGADOR LIBERADO (SIN RESTRICCIONES DE RAM) ---
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox', 
            '--disable-setuid-sandbox', 
            '--disable-dev-shm-usage', 
            '--disable-gpu'
        ],
        timeout: 0
    }
});

let sesiones = {};
let htmlContenido = "<h2 style='text-align:center;font-family:Arial;margin-top:50px;'>⚙️ Arrancando el Sistema PRO...</h2>";

const numeroDelBot = '50664797833'; 

client.on('qr', async (qr) => {
    try {
        const qrImage = await qrcodeImg.toDataURL(qr);
        htmlContenido = `
            <div style="text-align:center;margin-top:40px;font-family:Arial;">
                <h1 style="color:#075e54;">🍿 Bot La Fábrica de los Sueños</h1>
                <p>Escanea este código con tu NUEVO NÚMERO</p>
                <img src="${qrImage}" style="width:320px;height:320px;border:4px solid #333;border-radius:15px;" />
            </div>`;
        console.log('--- NUEVO QR GENERADO ---');
    } catch (e) { }
});

client.on('authenticated', () => { 
    console.log('✅ SESIÓN AUTENTICADA. Conectando navegador libremente...'); 
});

client.on('ready', () => { 
    console.log('🚀 SISTEMA SAAS DE CINE CORRIENDO AL 100%'); 
    htmlContenido = "<h1 style='color:green;text-align:center;margin-top:50px;'>✅ ¡Bot Conectado y Listo para Vender!</h1>";
});

// --- 🧠 CEREBRO DEL BOT COMPLETO ---
client.on('message', async msg => {
    try {
        if (!msg.body) return; 
        console.log(`📩 Mensaje de [${msg.from}]: ${msg.body}`); 
        const chat = msg.body.toLowerCase().trim();
        let fone = msg.from.split('@')[0]; 

        if (chat === 'reset') { delete sesiones[fone]; msg.reply('🔄 Sesión reiniciada. Escribe "hola".'); return; }

        if (chat === '*admin*') {
            sesiones[fone] = { paso: 'menu_admin' };
            msg.reply('🛠️ *MODO ADMIN CINE*\n\n1. 🎬 Agregar Película\n2. 📋 Ver Cartelera\n3. 🗑️ Eliminar Película\n4. 💰 Ver Resumen');
            return;
        }

        if (sesiones[fone]?.paso === 'menu_admin') {
            if (chat === '1') { sesiones[fone].paso = 'admin_titulo'; msg.reply('🎬 Escribe el Título:'); return; }
            else if (chat === '2') {
                const r = await pool.query('SELECT id, titulo, horario, cupos_disponibles FROM peliculas');
                if (r.rows.length === 0) { msg.reply('⚠️ La cartelera está vacía.'); delete sesiones[fone]; return; }
                let l = '🎬 *Cartelera Actual:*\n\n'; r.rows.forEach(p => l += `ID: ${p.id} | ${p.titulo} (${p.horario}) | Libres: ${p.cupos_disponibles}\n`);
                msg.reply(l); delete sesiones[fone]; return;
            }
            else if (chat === '3') {
                const r = await pool.query('SELECT id, titulo FROM peliculas');
                let l = '🗑️ Escribe el ID para eliminar:\n\n'; r.rows.forEach(p => l += `${p.id} - ${p.titulo}\n`);
                sesiones[fone].paso = 'admin_eliminar_pelicula'; msg.reply(l); return;
            }
            else if (chat === '4') {
                const r = await pool.query('SELECT COUNT(id) as t, SUM(cantidad_personas) as p FROM reservas');
                msg.reply(`💰 *TAQUILLA*\nTickets: ${r.rows[0].t}\nPersonas: ${r.rows[0].p || 0}`);
                delete sesiones[fone]; return;
            }
        }

        if (sesiones[fone]?.paso === 'admin_titulo') { sesiones[fone].titulo = msg.body; sesiones[fone].paso = 'admin_horario'; msg.reply('⏰ Horario (Ej: 7:30 PM):'); return; }
        if (sesiones[fone]?.paso === 'admin_horario') { sesiones[fone].horario = msg.body; sesiones[fone].paso = 'admin_cupos'; msg.reply('🪑 Cupos:'); return; }
        if (sesiones[fone]?.paso === 'admin_cupos') {
            await pool.query('INSERT INTO peliculas (titulo, horario, cupo_total, cupos_disponibles) VALUES ($1,$2,$3,$4)', [sesiones[fone].titulo, sesiones[fone].horario, parseInt(chat), parseInt(chat)]);
            msg.reply('✅ Película agregada.'); delete sesiones[fone]; return;
        }
        if (sesiones[fone]?.paso === 'admin_eliminar_pelicula') {
            await pool.query('DELETE FROM reservas WHERE pelicula_id = $1', [chat]);
            await pool.query('DELETE FROM peliculas WHERE id = $1', [chat]);
            msg.reply('✅ Eliminada.'); delete sesiones[fone]; return;
        }

        if (chat.startsWith('*validar ')) {
            const id = parseInt(chat.split(' ')[1]);
            const check = await pool.query('SELECT asistio, telefono_cliente, nombre_cliente FROM reservas WHERE id = $1', [id]);
            if (check.rows.length === 0) return msg.reply(`⚠️ No existe ticket #${id}.`);
            if (check.rows[0].asistio) return msg.reply(`⚠️ CUIDADO: Ticket #${id} YA USADO.`);
            
            await pool.query('UPDATE reservas SET asistio = true WHERE id = $1', [id]);
            msg.reply(`✅ Autorizada. Ticket #${id}.`); 
            client.sendMessage(`${check.rows[0].telefono_cliente}@c.us`, `🎟️ ¡Hola ${check.rows[0].nombre_cliente}! Disfruta la película en *La Fábrica de los Sueños*. ¡Pasa por la dulcería! 🍿`);
            return;
        }

        if (['hola', 'menu', 'inicio'].includes(chat)) {
            delete sesiones[fone];
            msg.reply('🍿 *Cine Club La Fábrica de los Sueños* 🎬\n\n*1.* 🎟️ Ver Cartelera y Reservar\n*2.* ❓ ¿Cómo funciona?\n*3.* 📍 Ubicación');
            return;
        }

        if (chat === '1') {
            const res = await pool.query('SELECT * FROM peliculas WHERE cupos_disponibles > 0');
            if (res.rows.length === 0) return msg.reply('No hay funciones disponibles. 😔');
            let l = '🎬 *Cartelera:*\n\n'; res.rows.forEach(p => l += `ID: *${p.id}* - ${p.titulo} (${p.horario})\n`);
            msg.reply(l + '\n👉 *Envía solo el número de ID*:');
            sesiones[fone] = { paso: 'eligiendo_pelicula' }; return;
        } 
        if (sesiones[fone]?.paso === 'eligiendo_pelicula') { sesiones[fone] = { paso: 'esperando_nombre', peliculaId: chat }; msg.reply('¿A nombre de quién?'); return; }
        if (sesiones[fone]?.paso === 'esperando_nombre') { sesiones[fone].nombre = msg.body; sesiones[fone].paso = 'eligiendo_cantidad'; msg.reply('¿Cuántos espacios?'); return; }
        if (sesiones[fone]?.paso === 'eligiendo_cantidad') {
            const can = parseInt(chat);
            if(isNaN(can)) return msg.reply('Envía un número.');
            const r = await pool.query('INSERT INTO reservas (telefono_cliente, nombre_cliente, pelicula_id, cantidad_personas) VALUES ($1,$2,$3,$4) RETURNING id', [fone, sesiones[fone].nombre, sesiones[fone].peliculaId, can]);
            await pool.query('UPDATE peliculas SET cupos_disponibles = cupos_disponibles - $1 WHERE id = $2', [can, sesiones[fone].peliculaId]);
            const link = `https://wa.me/${numeroDelBot}?text=*validar%20${r.rows[0].id}*`;
            const qrTicket = await qrcodeImg.toDataURL(link);
            const media = new MessageMedia('image/png', qrTicket.split(',')[1], 'ticket.png');
            await client.sendMessage(msg.from, media, { caption: `✅ *RESERVA CONFIRMADA*\n👤 ${sesiones[fone].nombre}\n👥 Espacios: ${can}\n🎫 Ticket: #${r.rows[0].id}\nPresenta este QR en la entrada.` });
            delete sesiones[fone]; return;
        }
        if (chat === '2') { msg.reply('🎥 Entrada gratis. Nos sostenemos gracias a la Dulcería 🍿.'); } 
        else if (chat === '3') { msg.reply('📍 Mall Plaza Paraíso.'); } 

    } catch (e) { console.log("❌ Error:", e.message); }
});

client.initialize();

http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.write(htmlContenido);
    res.end();
}).listen(process.env.PORT || 10000);
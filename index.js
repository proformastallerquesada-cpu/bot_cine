const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcodeTerminal = require('qrcode-terminal');
const qrcodeImg = require('qrcode');
const { Pool } = require('pg');
const cron = require('node-cron');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http'); // Salva-vidas de Render

// --- 🌐 PÁGINA WEB DEL QR ---
let htmlContenido = "<h2 style='font-family: Arial; text-align: center; margin-top: 50px; color: #555;'>⚙️ Iniciando el motor de tu Bot... Espera unos 15 segundos y recarga esta página.</h2>";

// --- ☁️ CONEXIÓN A NEON ---
const pool = new Pool({
    connectionString: process.env.DATABASE_URL, 
    ssl: { rejectUnauthorized: false }
});

// --- 🤖 NAVEGADOR CONFIGURADO PARA RENDER ---
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas', '--no-first-run', '--no-zygote',
            '--single-process', '--disable-gpu'
        ]
    }
});

let sesiones = {}; let tareaCierre; let tareaAsistencia; let tareaCobro;
const numeroDuenio = '50688734753@c.us'; 
const numeroDelBot = '50664797833';

// --- 🕒 AUTOMATIZACIÓN DE REPORTES ---
async function actualizarProgramacion() {
    try {
        const confRes = await pool.query("SELECT clave, valor FROM configuracion");
        const config = {};
        confRes.rows.forEach(r => config[r.clave] = r.valor);

        if (tareaCierre) tareaCierre.stop();
        if (config.dia_cierre && config.hora_cierre) {
            const [h, m] = config.hora_cierre.split(':');
            tareaCierre = cron.schedule(`${m} ${h} * * ${config.dia_cierre}`, async () => {
                await pool.query('UPDATE peliculas SET cupos_disponibles = 0');
                ejecutarReporte('reporte.py', '📊 *Reporte de Reservas (Previo)*');
            }, { timezone: "America/Costa_Rica" });
        }

        if (tareaAsistencia) tareaAsistencia.stop();
        if (config.dia_asistencia && config.hora_asistencia) {
            const [h, m] = config.hora_asistencia.split(':');
            tareaAsistencia = cron.schedule(`${m} ${h} * * ${config.dia_asistencia}`, async () => {
                ejecutarReporte('reporte_asistencia.py', '📋 *Reporte de Asistencia Final (Real)*');
            }, { timezone: "America/Costa_Rica" });
        }

        if (tareaCobro) tareaCobro.stop();
        if (config.dia_cobro && config.hora_cobro && config.numero_personal) {
            const [h, m] = config.hora_cobro.split(':');
            const pNum = config.numero_personal.includes('@c.us') ? config.numero_personal : `${config.numero_personal}@c.us`;
            tareaCobro = cron.schedule(`${m} ${h} * * ${config.dia_cobro}`, async () => {
                const r = await pool.query('SELECT COUNT(id) as t, SUM(cantidad_personas) as p FROM reservas');
                const info = `💰 *CORTE DE COBRO*\n\nTickets: ${r.rows[0].t}\nPersonas: ${r.rows[0].p || 0}`;
                client.sendMessage(numeroDuenio, info);
                client.sendMessage(pNum, info);
            }, { timezone: "America/Costa_Rica" });
        }
    } catch (e) { console.error("Error en automatización:", e); }
}

function ejecutarReporte(script, caption) {
    const sPath = path.join(__dirname, script);
    exec(`python "${sPath}"`, (error) => {
        if (error) return;
        const f = new Date().toLocaleDateString('es-CR').replace(/\//g, '-');
        const n = script === 'reporte.py' ? `${f}.xlsx` : `Asistencia_Final_${f}.xlsx`;
        const r = path.join(__dirname, n);
        if (fs.existsSync(r)) client.sendMessage(numeroDuenio, MessageMedia.fromFilePath(r), { caption });
    });
}

// --- 📸 GENERADOR VISUAL DE QR ---
client.on('qr', async (qr) => {
    console.log('--- NUEVO QR GENERADO (Míralo en la página web) ---');
    qrcodeTerminal.generate(qr, { small: true });
    
    try {
        const qrImage = await qrcodeImg.toDataURL(qr);
        htmlContenido = `
            <div style="text-align: center; margin-top: 40px; font-family: Arial;">
                <h1 style="color: #075e54;">🍿 Bot La Fábrica de los Sueños</h1>
                <h2>📱 Escanea este código con tu WhatsApp</h2>
                <p>Abre WhatsApp > Dispositivos Vinculados > Vincular un dispositivo</p>
                <img src="${qrImage}" style="width: 320px; height: 320px; border: 3px solid #333; padding: 15px; border-radius: 15px; box-shadow: 0 4px 10px rgba(0,0,0,0.2);" />
                <p style="color: gray; margin-top: 20px;"><i>⚠️ El código cambia cada minuto. Si no te funciona, recarga esta página (presiona F5) para ver uno nuevo.</i></p>
            </div>
        `;
    } catch (e) { console.log(e); }
});

client.on('ready', () => { 
    console.log('✅ Sistema SaaS de Cine listo en la NUBE (Render).'); 
    htmlContenido = `
        <div style="text-align: center; margin-top: 50px; font-family: Arial;">
            <h1 style="color: #28a745;">✅ ¡Bot Conectado y Funcionando!</h1>
            <p>El sistema de reservas está activo y vigilando WhatsApp.</p>
        </div>
    `;
    actualizarProgramacion(); 
});

// --- 💬 LÓGICA DE MENSAJES ---
client.on('message', async msg => {
    try {
        const chat = msg.body.toLowerCase().trim();
        const contacto = await msg.getContact();
        let fone = contacto.number || msg.from.split('@')[0];
        if (fone.includes('lid')) fone = msg.from.split('@')[0];

        const resConf = await pool.query("SELECT clave, valor FROM configuracion WHERE clave IN ('tipo_plan', 'creditos_disponibles', 'fecha_vencimiento')");
        const config = {}; resConf.rows.forEach(r => config[r.clave] = r.valor);

        // --- 🛠️ MODO ADMIN ---
        if (chat === '*admin*') {
            sesiones[fone] = { paso: 'menu_admin' };
            msg.reply('🛠️ *MODO ADMIN*\n\n1. Películas\n2. Cierre Reservas\n3. Reporte Asistencia\n4. Enviar Asistencia YA\n5. Eliminar Película\n6. Ver Cobro YA\n7. Configurar Cobro\n8. Cambiar Plan\n9. 💎 Recargar / Renovar');
            return;
        }

        if (sesiones[fone] && sesiones[fone].paso === 'menu_admin') {
            if (chat === '1') { sesiones[fone].paso = 'admin_titulo'; msg.reply('🎬 Título:'); return; }
            else if (chat === '2') { sesiones[fone].paso = 'conf_dia'; sesiones[fone].tipo = 'cierre'; msg.reply('📅 Día Cierre (1-7):'); return;}
            else if (chat === '3') { sesiones[fone].paso = 'conf_dia'; sesiones[fone].tipo = 'asistencia'; msg.reply('📅 Día Asistencia (1-7):'); return;}
            else if (chat === '4') { ejecutarReporte('reporte_asistencia.py', '📋 Asistencia'); delete sesiones[fone]; return;}
            else if (chat === '5') {
                const r = await pool.query('SELECT id, titulo FROM peliculas');
                let l = '🗑️ ID a eliminar:\n'; r.rows.forEach(p => l += `${p.id} - ${p.titulo}\n`);
                sesiones[fone].paso = 'admin_eliminar_pelicula'; msg.reply(l); return;
            }
            else if (chat === '6') {
                const r = await pool.query('SELECT COUNT(id) as t, SUM(cantidad_personas) as p FROM reservas');
                msg.reply(`💰 *COBRO Y ESTADÍSTICAS*\nTickets: ${r.rows[0].t}\nPersonas: ${r.rows[0].p || 0}`);
                delete sesiones[fone]; return;
            }
        }

        if (sesiones[fone] && sesiones[fone].paso === 'admin_titulo') { sesiones[fone].titulo = msg.body; sesiones[fone].paso = 'admin_horario'; msg.reply('⏰ Horario:'); return; }
        if (sesiones[fone] && sesiones[fone].paso === 'admin_horario') { sesiones[fone].horario = msg.body; sesiones[fone].paso = 'admin_cupos'; msg.reply('🪑 Cupos:'); return; }
        if (sesiones[fone] && sesiones[fone].paso === 'admin_cupos') {
            await pool.query('INSERT INTO peliculas (titulo, horario, cupo_total, cupos_disponibles) VALUES ($1,$2,$3,$4)', [sesiones[fone].titulo, sesiones[fone].horario, parseInt(chat), parseInt(chat)]);
            msg.reply('✅ Película agregada.'); delete sesiones[fone]; return;
        }
        if (sesiones[fone] && sesiones[fone].paso === 'admin_eliminar_pelicula') {
            await pool.query('DELETE FROM reservas WHERE pelicula_id = $1', [chat]);
            await pool.query('DELETE FROM peliculas WHERE id = $1', [chat]);
            msg.reply('✅ Eliminada.'); delete sesiones[fone]; return;
        }

        // --- VALIDAR TICKET ---
        if (chat.startsWith('*validar ')) {
            const id = parseInt(chat.split(' ')[1]);
            const check = await pool.query('SELECT asistio FROM reservas WHERE id = $1', [id]);
            if (check.rows.length === 0) return msg.reply(`⚠️ No existe el ticket #${id}.`);
            if (check.rows[0].asistio) return msg.reply(`⚠️ Ticket #${id} YA fue validado.`);
            await pool.query('UPDATE reservas SET asistio = true WHERE id = $1', [id]);
            msg.reply(`✅ Ticket #${id} validado con éxito.`); return;
        }

        // --- MENÚ CLIENTE ---
        if (['hola', 'menú', 'inicio', 'menu'].includes(chat)) {
            delete sesiones[fone];
            msg.reply('🍿 *Cine Club La Fábrica de los Sueños* 🎬\n\n*1.* 🎟️ Reservar Entradas\n*2.* ❓ ¿Cómo funciona?\n*3.* 📍 Ubicación\n*4.* 👤 Hablar con Encargado');
            return;
        }

        if (chat === '1') {
            const res = await pool.query('SELECT * FROM peliculas WHERE cupos_disponibles > 0');
            if (res.rows.length === 0) return msg.reply('No hay funciones disponibles.');
            let l = '🎬 *Cartelera:*\n\n';
            res.rows.forEach(p => l += `ID: *${p.id}* - ${p.titulo} (${p.horario})\n`);
            msg.reply(l + '\nEnvía el número de *ID* de la película:');
            sesiones[fone] = { paso: 'eligiendo_pelicula' };
        } 
        else if (sesiones[fone] && sesiones[fone].paso === 'eligiendo_pelicula') {
            sesiones[fone] = { paso: 'esperando_nombre', peliculaId: chat }; msg.reply('¿A nombre de quién hacemos la reserva?');
        }
        else if (sesiones[fone] && sesiones[fone].paso === 'esperando_nombre') {
            sesiones[fone].nombre = msg.body; sesiones[fone].paso = 'eligiendo_cantidad'; msg.reply('¿Cuántos espacios necesitas?');
        }
        else if (sesiones[fone] && sesiones[fone].paso === 'eligiendo_cantidad') {
            const can = parseInt(chat);
            const r = await pool.query('INSERT INTO reservas (telefono_cliente, nombre_cliente, pelicula_id, cantidad_personas) VALUES ($1,$2,$3,$4) RETURNING id', [fone, sesiones[fone].nombre, sesiones[fone].peliculaId, can]);
            await pool.query('UPDATE peliculas SET cupos_disponibles = cupos_disponibles - $1 WHERE id = $2', [can, sesiones[fone].peliculaId]);
            const link = `https://wa.me/${numeroDelBot}?text=*validar%20${r.rows[0].id}*`;
            const qr = await qrcodeImg.toDataURL(link);
            const media = new MessageMedia('image/png', qr.split(',')[1], 'ticket.png');
            await client.sendMessage(msg.from, media, { caption: `✅ *RESERVA LISTA*\n👤 ${sesiones[fone].nombre}\n🎫 Ticket: #${r.rows[0].id}` });
            delete sesiones[fone];
        }
        else if (chat === '2') { msg.reply('🎥 La entrada es **gratis**. Nos sostenemos gracias a nuestra Dulcería 🍿. ¡Apóyanos!'); } 
        else if (chat === '3') { msg.reply('📍 *Ubicación*\nAntigua sala de cine, Mall Plaza Paraíso.\nWaze: https://waze.com/ul?q=Mall+Plaza+Paraiso'); } 
        else if (chat === '4') { msg.reply('👤 Clic aquí para hablar con el encargado:\nhttps://wa.me/50688734753'); }

    } catch (e) { console.log(e); }
});

client.initialize();

// --- 🌐 EL PUERTO WEB PARA MOSTRAR LA IMAGEN ---
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.write(htmlContenido);
    res.end();
}).listen(process.env.PORT || 8080);
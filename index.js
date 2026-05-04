const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcodeImg = require('qrcode');
const { Pool } = require('pg');
const cron = require('node-cron');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');

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
let tareaCierre, tareaAsistencia, tareaCobro;
const numeroDuenio = '50688734753@c.us'; 
const numeroDelBot = '50664797833';

// --- 🛡️ AUTOMATIZACIÓN SEGURA (Sin crasheos) ---
async function actualizarProgramacion() {
    try {
        const confRes = await pool.query("SELECT clave, valor FROM configuracion");
        const config = {};
        confRes.rows.forEach(r => config[r.clave] = r.valor);

        // Seguro: Solo activa la alarma si la hora existe y tiene el formato correcto (ej. 19:00)
        if (config.dia_cierre && config.hora_cierre && config.hora_cierre.includes(':')) {
            const [h, m] = config.hora_cierre.split(':');
            if (tareaCierre) tareaCierre.stop();
            tareaCierre = cron.schedule(`${m} ${h} * * ${config.dia_cierre}`, async () => {
                await pool.query('UPDATE peliculas SET cupos_disponibles = 0');
                ejecutarReporte('reporte.py', '📊 *Reporte de Reservas (Previo)*');
            }, { timezone: "America/Costa_Rica" });
        }

        if (config.dia_asistencia && config.hora_asistencia && config.hora_asistencia.includes(':')) {
            const [h, m] = config.hora_asistencia.split(':');
            if (tareaAsistencia) tareaAsistencia.stop();
            tareaAsistencia = cron.schedule(`${m} ${h} * * ${config.dia_asistencia}`, async () => {
                ejecutarReporte('reporte_asistencia.py', '📋 *Reporte de Asistencia Final (Real)*');
            }, { timezone: "America/Costa_Rica" });
        }
    } catch (e) { 
        console.log("⚠️ Saltando alarmas: Faltan configuraciones en la base de datos. (Normal si es nueva)"); 
    }
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

// --- 🌟 EL SÚPER TRUCO DEL ENLACE QR ---
client.on('qr', (qr) => {
    const enlaceQR = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(qr)}`;
    console.log('\n=========================================');
    console.log('📲 HAZ CLIC EN ESTE ENLACE PARA VER TU CÓDIGO QR:');
    console.log(enlaceQR);
    console.log('=========================================\n');
});

client.on('ready', () => { 
    console.log('✅ Sistema SaaS de Cine COMPLETO listo en la NUBE.'); 
    actualizarProgramacion(); 
});

// --- 🤖 CEREBRO DEL BOT COMPLETO ---
client.on('message', async msg => {
    try {
        const chat = msg.body.toLowerCase().trim();
        const contacto = await msg.getContact();
        let fone = contacto.number || msg.from.split('@')[0];
        if (fone.includes('lid')) fone = msg.from.split('@')[0];

        // Reset de emergencia
        if (chat === 'reset') {
            delete sesiones[fone];
            msg.reply('🔄 Sesión reiniciada con éxito.');
            return;
        }

        // --- 🛠️ MODO ADMIN ---
        if (chat === '*admin*') {
            sesiones[fone] = { paso: 'menu_admin' };
            msg.reply('🛠️ *MODO ADMIN*\n\n1. Agregar Película\n2. Ver Cartelera\n3. Eliminar Película\n4. Ver Resumen de Cobro');
            return;
        }

        if (sesiones[fone]?.paso === 'menu_admin') {
            if (chat === '1') { sesiones[fone].paso = 'admin_titulo'; msg.reply('🎬 Título de la película:'); return; }
            else if (chat === '2') {
                const r = await pool.query('SELECT id, titulo, horario, cupos_disponibles FROM peliculas');
                let l = '🎬 *Cartelera Actual:*\n\n'; r.rows.forEach(p => l += `ID: ${p.id} | ${p.titulo} (${p.horario}) | Cupos: ${p.cupos_disponibles}\n`);
                msg.reply(l); delete sesiones[fone]; return;
            }
            else if (chat === '3') {
                const r = await pool.query('SELECT id, titulo FROM peliculas');
                let l = '🗑️ Escribe el ID de la película a eliminar:\n\n'; r.rows.forEach(p => l += `${p.id} - ${p.titulo}\n`);
                sesiones[fone].paso = 'admin_eliminar_pelicula'; msg.reply(l); return;
            }
            else if (chat === '4') {
                const r = await pool.query('SELECT COUNT(id) as t, SUM(cantidad_personas) as p FROM reservas');
                msg.reply(`💰 *COBRO Y ESTADÍSTICAS*\n\nTickets emitidos: ${r.rows[0].t}\nPersonas totales: ${r.rows[0].p || 0}`);
                delete sesiones[fone]; return;
            }
        }

        if (sesiones[fone]?.paso === 'admin_titulo') { sesiones[fone].titulo = msg.body; sesiones[fone].paso = 'admin_horario'; msg.reply('⏰ Horario (Ej: 7:00 PM):'); return; }
        if (sesiones[fone]?.paso === 'admin_horario') { sesiones[fone].horario = msg.body; sesiones[fone].paso = 'admin_cupos'; msg.reply('🪑 Cupos totales:'); return; }
        if (sesiones[fone]?.paso === 'admin_cupos') {
            await pool.query('INSERT INTO peliculas (titulo, horario, cupo_total, cupos_disponibles) VALUES ($1,$2,$3,$4)', [sesiones[fone].titulo, sesiones[fone].horario, parseInt(chat), parseInt(chat)]);
            msg.reply('✅ Película agregada a la base de datos.'); delete sesiones[fone]; return;
        }
        if (sesiones[fone]?.paso === 'admin_eliminar_pelicula') {
            await pool.query('DELETE FROM reservas WHERE pelicula_id = $1', [chat]);
            await pool.query('DELETE FROM peliculas WHERE id = $1', [chat]);
            msg.reply('✅ Película eliminada.'); delete sesiones[fone]; return;
        }

        // --- 🎫 VALIDAR TICKET EN PUERTA ---
        if (chat.startsWith('*validar ')) {
            const id = parseInt(chat.split(' ')[1]);
            const check = await pool.query('SELECT asistio, telefono_cliente, nombre_cliente FROM reservas WHERE id = $1', [id]);
            if (check.rows.length === 0) return msg.reply(`⚠️ No existe el ticket #${id}.`);
            if (check.rows[0].asistio) return msg.reply(`⚠️ Ticket #${id} YA fue validado anteriormente.`);
            
            await pool.query('UPDATE reservas SET asistio = true WHERE id = $1', [id]);
            msg.reply(`✅ Ticket #${id} validado con éxito. Entrada autorizada.`); 

            // Guardar cliente en BD silenciosamente
            await pool.query(
                `INSERT INTO clientes (telefono, nombre) VALUES ($1, $2) 
                 ON CONFLICT (telefono) DO UPDATE SET total_reservas = clientes.total_reservas + 1, ultima_visita = CURRENT_TIMESTAMP`,
                [check.rows[0].telefono_cliente, check.rows[0].nombre_cliente]
            );

            // Mensaje automático al cliente
            const numCliente = `${check.rows[0].telefono_cliente}@c.us`;
            client.sendMessage(numCliente, `🎟️ ¡Hola ${check.rows[0].nombre_cliente}! Gracias por acompañarnos hoy en *La Fábrica de los Sueños*. Recuerda que nuestro cine se sostiene gracias a ti. ¡Date una vuelta por la dulcería y disfruta la función! 🍿🎬`);
            return;
        }

        // --- 🍿 MENÚ CLIENTE NORMAL ---
        if (['hola', 'menu', 'inicio', 'menú', 'buenas'].includes(chat)) {
            delete sesiones[fone];
            msg.reply('🍿 *Cine Club La Fábrica de los Sueños* 🎬\n\n*1.* 🎟️ Reservar Entradas\n*2.* ❓ ¿Cómo funciona?\n*3.* 📍 Ubicación\n*4.* 👤 Hablar con Encargado');
            return;
        }

        if (chat === '1') {
            const res = await pool.query('SELECT * FROM peliculas WHERE cupos_disponibles > 0');
            if (res.rows.length === 0) return msg.reply('Lo sentimos, en este momento no hay funciones con espacios disponibles. 😔');
            let l = '🎬 *Cartelera Disponible:*\n\n';
            res.rows.forEach(p => l += `ID: *${p.id}* - ${p.titulo} (${p.horario})\n`);
            msg.reply(l + '\nEnvía el número de *ID* de la película que deseas ver:');
            sesiones[fone] = { paso: 'eligiendo_pelicula' };
            return;
        } 
        
        if (sesiones[fone]?.paso === 'eligiendo_pelicula') {
            sesiones[fone] = { paso: 'esperando_nombre', peliculaId: chat }; 
            msg.reply('Excelente. ¿A nombre de quién hacemos la reserva?');
            return;
        }
        
        if (sesiones[fone]?.paso === 'esperando_nombre') {
            sesiones[fone].nombre = msg.body; 
            sesiones[fone].paso = 'eligiendo_cantidad'; 
            msg.reply('¿Cuántos espacios necesitas en total? (Envía solo el número)');
            return;
        }
        
        if (sesiones[fone]?.paso === 'eligiendo_cantidad') {
            const can = parseInt(chat);
            if(isNaN(can)) return msg.reply('Por favor envía un número válido.');
            
            const r = await pool.query('INSERT INTO reservas (telefono_cliente, nombre_cliente, pelicula_id, cantidad_personas) VALUES ($1,$2,$3,$4) RETURNING id', [fone, sesiones[fone].nombre, sesiones[fone].peliculaId, can]);
            await pool.query('UPDATE peliculas SET cupos_disponibles = cupos_disponibles - $1 WHERE id = $2', [can, sesiones[fone].peliculaId]);
            
            // Generador del QR del Ticket
            const link = `https://wa.me/${numeroDelBot}?text=*validar%20${r.rows[0].id}*`;
            const qrTicket = await qrcodeImg.toDataURL(link);
            const media = new MessageMedia('image/png', qrTicket.split(',')[1], 'ticket.png');
            
            await client.sendMessage(msg.from, media, { caption: `✅ *RESERVA CONFIRMADA*\n\n👤 A nombre de: ${sesiones[fone].nombre}\n👥 Espacios: ${can}\n🎫 Número de Ticket: #${r.rows[0].id}\n\nPresenta este código QR en la entrada.` });
            delete sesiones[fone];
            return;
        }
        
        if (chat === '2') { msg.reply('🎥 La entrada es **totalmente gratis**. Nuestro proyecto cultural se sostiene exclusivamente gracias a nuestra Dulcería 🍿. ¡Apóyanos comprando tus snacks con nosotros!'); } 
        else if (chat === '3') { msg.reply('📍 *Ubicación*\nAntigua sala de cine, Mall Plaza Paraíso.\nWaze: https://waze.com/ul?q=Mall+Plaza+Paraiso'); } 
        else if (chat === '4') { msg.reply('👤 Clic aquí para hablar directamente con el administrador:\nhttps://wa.me/50688734753'); }

    } catch (e) { 
        console.log("Error en el chat:", e); 
    }
});

client.initialize();

// Servidor web obligatorio para Render
http.createServer((req, res) => { 
    res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'}); 
    res.write("<h1 style='font-family:Arial;text-align:center;margin-top:50px;color:green;'>✅ Sistema del Cine Corriendo al 100%</h1>"); 
    res.end(); 
}).listen(process.env.PORT || 8080);
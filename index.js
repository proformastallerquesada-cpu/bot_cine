const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcodeImg = require('qrcode');
const { Pool } = require('pg');
const http = require('http');

// --- 🛡️ ESCUDO ANTI-CRASHEOS ---
process.on('unhandledRejection', error => {
    console.log('⚠️ Aviso del servidor (Ignorado para no apagar el bot):', error.message || error);
});

// --- 🗄️ CONEXIÓN A BASE DE DATOS (NEON) ---
const pool = new Pool({
    connectionString: process.env.DATABASE_URL, 
    ssl: { rejectUnauthorized: false }
});

// --- 🤖 CONFIGURACIÓN DEL BOT (VERSIÓN PRO) ---
const client = new Client({
    authStrategy: new LocalAuth(),
    authTimeoutMs: 0, // ⏳ Paciencia infinita para que no se desconecte
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox', 
            '--disable-setuid-sandbox', 
            '--disable-dev-shm-usage', 
            '--disable-gpu',
            '--single-process'
        ],
        timeout: 0
    }
});

let sesiones = {};
let htmlContenido = "<h2 style='text-align:center;font-family:Arial;color:#555;margin-top:50px;'>⚙️ El motor PRO está encendiendo... Espera 30 segundos y presiona F5.</h2>";

const numeroDelBot = '50664797833'; // Tu número de bot para los QR

// --- 📸 PANTALLA WEB PARA ESCANEAR EL QR ---
client.on('qr', async (qr) => {
    try {
        const qrImage = await qrcodeImg.toDataURL(qr);
        htmlContenido = `
            <div style="text-align:center;margin-top:40px;font-family:Arial;">
                <h1 style="color:#075e54;">🍿 Bot La Fábrica de los Sueños (PRO)</h1>
                <p>Abre WhatsApp > Dispositivos Vinculados > Escanear QR</p>
                <img src="${qrImage}" style="width:320px;height:320px;border:4px solid #333;border-radius:15px;box-shadow: 0 4px 10px rgba(0,0,0,0.2);" />
                <p style="color:gray;margin-top:15px;"><i>⚠️ El código se renueva cada minuto por seguridad.</i></p>
            </div>`;
        console.log('--- NUEVO QR GENERADO EN LA WEB ---');
    } catch (e) { console.log(e); }
});

client.on('authenticated', () => { console.log('✅ SESIÓN AUTENTICADA CON ÉXITO'); });

client.on('ready', () => { 
    console.log('🚀 SISTEMA SAAS DE CINE CORRIENDO AL 100%'); 
    htmlContenido = `
        <div style="text-align:center;margin-top:50px;font-family:Arial;">
            <h1 style="color:#28a745;">✅ ¡Bot Conectado y Listo para Vender!</h1>
            <p>El sistema de reservas está activo y monitoreando WhatsApp 24/7.</p>
        </div>`;
});

// --- 🧠 CEREBRO DEL BOT COMPLETO ---
client.on('message', async msg => {
    try {
        console.log(`📩 Mensaje de [${msg.from}]: ${msg.body}`); // Registro en pantalla negra
        
        const chat = msg.body.toLowerCase().trim();
        let fone = msg.from.split('@')[0]; // Identificador súper rápido

        // Reset manual
        if (chat === 'reset') {
            delete sesiones[fone];
            msg.reply('🔄 Sesión reiniciada. Escribe "hola" para volver al menú.');
            return;
        }

        // --- 🛠️ MODO ADMINISTRADOR ---
        if (chat === '*admin*') {
            sesiones[fone] = { paso: 'menu_admin' };
            msg.reply('🛠️ *MODO ADMIN CINE*\n\n1. 🎬 Agregar Película\n2. 📋 Ver Cartelera\n3. 🗑️ Eliminar Película\n4. 💰 Ver Resumen de Reservas');
            return;
        }

        if (sesiones[fone]?.paso === 'menu_admin') {
            if (chat === '1') { sesiones[fone].paso = 'admin_titulo'; msg.reply('🎬 Escribe el Título de la película:'); return; }
            else if (chat === '2') {
                const r = await pool.query('SELECT id, titulo, horario, cupos_disponibles FROM peliculas');
                if (r.rows.length === 0) { msg.reply('⚠️ La cartelera está vacía.'); delete sesiones[fone]; return; }
                let l = '🎬 *Cartelera Actual:*\n\n'; r.rows.forEach(p => l += `ID: ${p.id} | ${p.titulo} (${p.horario}) | Cupos libres: ${p.cupos_disponibles}\n`);
                msg.reply(l); delete sesiones[fone]; return;
            }
            else if (chat === '3') {
                const r = await pool.query('SELECT id, titulo FROM peliculas');
                let l = '🗑️ Escribe el ID de la película a eliminar:\n\n'; r.rows.forEach(p => l += `${p.id} - ${p.titulo}\n`);
                sesiones[fone].paso = 'admin_eliminar_pelicula'; msg.reply(l); return;
            }
            else if (chat === '4') {
                const r = await pool.query('SELECT COUNT(id) as t, SUM(cantidad_personas) as p FROM reservas');
                msg.reply(`💰 *RESUMEN DE TAQUILLA*\n\nTickets emitidos: ${r.rows[0].t}\nPersonas totales reservadas: ${r.rows[0].p || 0}`);
                delete sesiones[fone]; return;
            }
        }

        if (sesiones[fone]?.paso === 'admin_titulo') { sesiones[fone].titulo = msg.body; sesiones[fone].paso = 'admin_horario'; msg.reply('⏰ Horario (Ej: 7:30 PM):'); return; }
        if (sesiones[fone]?.paso === 'admin_horario') { sesiones[fone].horario = msg.body; sesiones[fone].paso = 'admin_cupos'; msg.reply('🪑 Cupos totales en la sala (Ej: 150):'); return; }
        if (sesiones[fone]?.paso === 'admin_cupos') {
            await pool.query('INSERT INTO peliculas (titulo, horario, cupo_total, cupos_disponibles) VALUES ($1,$2,$3,$4)', [sesiones[fone].titulo, sesiones[fone].horario, parseInt(chat), parseInt(chat)]);
            msg.reply('✅ Película agregada a la cartelera.'); delete sesiones[fone]; return;
        }
        if (sesiones[fone]?.paso === 'admin_eliminar_pelicula') {
            await pool.query('DELETE FROM reservas WHERE pelicula_id = $1', [chat]);
            await pool.query('DELETE FROM peliculas WHERE id = $1', [chat]);
            msg.reply('✅ Película y reservas eliminadas.'); delete sesiones[fone]; return;
        }

        // --- 🎫 ESCÁNER DE ENTRADA (VALIDAR TICKET) ---
        if (chat.startsWith('*validar ')) {
            const id = parseInt(chat.split(' ')[1]);
            const check = await pool.query('SELECT asistio, telefono_cliente, nombre_cliente FROM reservas WHERE id = $1', [id]);
            if (check.rows.length === 0) return msg.reply(`⚠️ No existe el ticket #${id}.`);
            if (check.rows[0].asistio) return msg.reply(`⚠️ CUIDADO: El Ticket #${id} YA FUE USADO.`);
            
            await pool.query('UPDATE reservas SET asistio = true WHERE id = $1', [id]);
            msg.reply(`✅ Entrada Autorizada. Ticket #${id} validado.`); 

            const numCliente = `${check.rows[0].telefono_cliente}@c.us`;
            client.sendMessage(numCliente, `🎟️ ¡Hola ${check.rows[0].nombre_cliente}! Gracias por acompañarnos en *La Fábrica de los Sueños*. ¡Disfruta la película y no olvides pasar por nuestra dulcería! 🍿🎬`);
            return;
        }

        // --- 🍿 MENÚ PÚBLICO DE CLIENTES ---
        if (['hola', 'menu', 'inicio', 'menú', 'buenas'].includes(chat)) {
            delete sesiones[fone];
            msg.reply('🍿 *Cine Club La Fábrica de los Sueños* 🎬\n\nBienvenido a nuestra cartelera automática. Responde con un número:\n\n*1.* 🎟️ Ver Cartelera y Reservar\n*2.* ❓ ¿Cómo funciona?\n*3.* 📍 Ubicación\n*4.* 👤 Hablar con Encargado');
            return;
        }

        if (chat === '1') {
            const res = await pool.query('SELECT * FROM peliculas WHERE cupos_disponibles > 0');
            if (res.rows.length === 0) return msg.reply('Lo sentimos, en este momento no hay funciones con espacios disponibles. 😔');
            let l = '🎬 *Cartelera Disponible:*\n\n';
            res.rows.forEach(p => l += `ID: *${p.id}* - ${p.titulo} (${p.horario})\n`);
            msg.reply(l + '\n👉 *Envía solo el número de ID* de la película que deseas ver:');
            sesiones[fone] = { paso: 'eligiendo_pelicula' };
            return;
        } 
        
        if (sesiones[fone]?.paso === 'eligiendo_pelicula') {
            sesiones[fone] = { paso: 'esperando_nombre', peliculaId: chat }; 
            msg.reply('Excelente. ¿A nombre de quién hacemos la reserva? (Nombre y Apellido)');
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
            
            // Crea el Ticket QR
            const link = `https://wa.me/${numeroDelBot}?text=*validar%20${r.rows[0].id}*`;
            const qrTicket = await qrcodeImg.toDataURL(link);
            const media = new MessageMedia('image/png', qrTicket.split(',')[1], 'ticket.png');
            
            await client.sendMessage(msg.from, media, { caption: `✅ *RESERVA CONFIRMADA*\n\n👤 A nombre de: ${sesiones[fone].nombre}\n👥 Espacios: ${can}\n🎫 Número de Ticket: #${r.rows[0].id}\n\nPresenta este código QR en la entrada del cine.` });
            delete sesiones[fone];
            return;
        }
        
        if (chat === '2') { msg.reply('🎥 Nuestro modelo de cine es único. La entrada es **totalmente gratis**. El proyecto cultural se sostiene exclusivamente gracias a nuestra Dulcería 🍿. ¡Llega temprano, compra tus snacks y apóyanos!'); } 
        else if (chat === '3') { msg.reply('📍 *Ubicación*\nAntigua sala de cine, Mall Plaza Paraíso.\nWaze: https://waze.com/ul?q=Mall+Plaza+Paraiso'); } 
        else if (chat === '4') { msg.reply('👤 Clic aquí para hablar directamente con el administrador:\nhttps://wa.me/50688734753'); }

    } catch (e) { 
        console.log("❌ Error procesando el mensaje:", e); 
    }
});

client.initialize();

// --- 🌐 SERVIDOR WEB ---
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.write(htmlContenido);
    res.end();
}).listen(process.env.PORT || 10000);
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcodeImg = require('qrcode');
const { Pool } = require('pg');
const http = require('http');

// ==========================================
// 🛡️ 1. ESCUDOS DE SEGURIDAD (ANTI-CRASH)
// ==========================================
process.on('unhandledRejection', error => { 
    console.log('⚠️ Promesa ignorada:', error.message); 
});
process.on('uncaughtException', error => { 
    console.log('💥 ERROR EVITADO:', error.message); 
});

// ==========================================
// 🗄️ 2. CONEXIÓN A LA BASE DE DATOS (NEON)
// ==========================================
const pool = new Pool({
    connectionString: process.env.DATABASE_URL, 
    ssl: { rejectUnauthorized: false }
});

// ==========================================
// 🚀 3. CONFIGURACIÓN DEL NAVEGADOR (LIBERADO)
// ==========================================
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

const numeroDelBot = '50664797833'; // TU NÚMERO DE WHATSAPP DEL BOT

// ==========================================
// 📸 4. GENERADOR DE CÓDIGO QR EN LA WEB
// ==========================================
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
    } catch (e) {
        console.log("Error generando QR visual.");
    }
});

client.on('authenticated', () => { 
    console.log('✅ SESIÓN AUTENTICADA. Conectando navegador libremente...'); 
});

client.on('ready', () => { 
    console.log('🚀 SISTEMA SAAS DE CINE CORRIENDO AL 100%'); 
    htmlContenido = "<h1 style='color:green;text-align:center;margin-top:50px;'>✅ ¡Bot Conectado y Listo para Vender!</h1>";
});

// ==========================================
// 🧠 5. CEREBRO DEL BOT (MENÚS Y LÓGICA)
// ==========================================
client.on('message', async msg => {
    try {
        // Ignorar estados, stickers, fotos sin texto para evitar caídas
        if (!msg.body) return; 

        console.log(`📩 Mensaje de [${msg.from}]: ${msg.body}`); 
        
        const chat = msg.body.toLowerCase().trim();
        let fone = msg.from.split('@')[0]; 

        // Botón de emergencia para reiniciar la conversación
        if (chat === 'reset') { 
            delete sesiones[fone]; 
            msg.reply('🔄 Sesión reiniciada. Escribe "hola".'); 
            return; 
        }

        // ------------------------------------------
        // 🛠️ ZONA DE ADMINISTRADOR
        // ------------------------------------------
        if (chat === '*admin*') {
            sesiones[fone] = { paso: 'menu_admin' };
            msg.reply('🛠️ *MODO ADMIN CINE*\n\n1. 🎬 Agregar Película\n2. 📋 Ver Cartelera\n3. 🗑️ Eliminar Película\n4. 💰 Ver Resumen');
            return;
        }

        if (sesiones[fone]?.paso === 'menu_admin') {
            if (chat === '1') { 
                sesiones[fone].paso = 'admin_titulo'; 
                msg.reply('🎬 Escribe el Título:'); 
                return; 
            }
            else if (chat === '2') {
                const r = await pool.query('SELECT id, titulo, horario, cupos_disponibles FROM peliculas');
                if (r.rows.length === 0) { 
                    msg.reply('⚠️ La cartelera está vacía.'); 
                    delete sesiones[fone]; 
                    return; 
                }
                let lista = '🎬 *Cartelera Actual:*\n\n'; 
                r.rows.forEach(p => {
                    lista += `ID: ${p.id} | ${p.titulo} (${p.horario}) | Libres: ${p.cupos_disponibles}\n`;
                });
                msg.reply(lista); 
                delete sesiones[fone]; 
                return;
            }
            else if (chat === '3') {
                const r = await pool.query('SELECT id, titulo FROM peliculas');
                let lista = '🗑️ Escribe el ID para eliminar:\n\n'; 
                r.rows.forEach(p => lista += `${p.id} - ${p.titulo}\n`);
                sesiones[fone].paso = 'admin_eliminar_pelicula'; 
                msg.reply(lista); 
                return;
            }
            else if (chat === '4') {
                const r = await pool.query('SELECT COUNT(id) as t, SUM(cantidad_personas) as p FROM reservas');
                msg.reply(`💰 *TAQUILLA*\nTickets Emitidos: ${r.rows[0].t}\nPersonas Totales: ${r.rows[0].p || 0}`);
                delete sesiones[fone]; 
                return;
            }
        }

        // Flujo para agregar película
        if (sesiones[fone]?.paso === 'admin_titulo') { 
            sesiones[fone].titulo = msg.body; 
            sesiones[fone].paso = 'admin_horario'; 
            msg.reply('⏰ Horario (Ej: 7:30 PM):'); 
            return; 
        }
        if (sesiones[fone]?.paso === 'admin_horario') { 
            sesiones[fone].horario = msg.body; 
            sesiones[fone].paso = 'admin_cupos'; 
            msg.reply('🪑 Cupos totales en sala:'); 
            return; 
        }
        if (sesiones[fone]?.paso === 'admin_cupos') {
            await pool.query(
                'INSERT INTO peliculas (titulo, horario, cupo_total, cupos_disponibles) VALUES ($1,$2,$3,$4)', 
                [sesiones[fone].titulo, sesiones[fone].horario, parseInt(chat), parseInt(chat)]
            );
            msg.reply('✅ Película agregada con éxito a la base de datos.'); 
            delete sesiones[fone]; 
            return;
        }

        // Flujo para eliminar película
        if (sesiones[fone]?.paso === 'admin_eliminar_pelicula') {
            await pool.query('DELETE FROM reservas WHERE pelicula_id = $1', [chat]);
            await pool.query('DELETE FROM peliculas WHERE id = $1', [chat]);
            msg.reply('✅ Película y sus reservas eliminadas del sistema.'); 
            delete sesiones[fone]; 
            return;
        }

        // ------------------------------------------
        // 🎫 ESCÁNER EN PUERTA (VALIDACIÓN DE TICKETS)
        // ------------------------------------------
        if (chat.startsWith('*validar ')) {
            const id = parseInt(chat.split(' ')[1]);
            const check = await pool.query('SELECT asistio, telefono_cliente, nombre_cliente FROM reservas WHERE id = $1', [id]);
            
            if (check.rows.length === 0) {
                return msg.reply(`⚠️ Alerta: No existe el ticket #${id}.`);
            }
            if (check.rows[0].asistio) {
                return msg.reply(`⚠️ CUIDADO: El Ticket #${id} YA FUE USADO ANTERIORMENTE.`);
            }
            
            // Marcar como usado
            await pool.query('UPDATE reservas SET asistio = true WHERE id = $1', [id]);
            msg.reply(`✅ Entrada Autorizada. Ticket #${id} validado correctamente.`); 
            
            // Mensaje silencioso de agradecimiento al cliente
            client.sendMessage(
                `${check.rows[0].telefono_cliente}@c.us`, 
                `🎟️ ¡Hola ${check.rows[0].nombre_cliente}! Disfruta la película en *La Fábrica de los Sueños*. ¡No olvides pasar por la dulcería! 🍿`
            );
            return;
        }

        // ------------------------------------------
        // 🍿 ZONA DE CLIENTES (MENÚ PÚBLICO)
        // ------------------------------------------
        if (['hola', 'menu', 'inicio', 'buenas'].includes(chat)) {
            delete sesiones[fone];
            msg.reply('🍿 *Cine Club La Fábrica de los Sueños* 🎬\n\nBienvenido a nuestra taquilla automática:\n\n*1.* 🎟️ Ver Cartelera y Reservar\n*2.* ❓ ¿Cómo funciona?\n*3.* 📍 Ubicación');
            return;
        }

        if (chat === '1') {
            const res = await pool.query('SELECT * FROM peliculas WHERE cupos_disponibles > 0');
            if (res.rows.length === 0) {
                return msg.reply('Lo sentimos, no hay funciones disponibles en este momento. 😔');
            }
            let listaPelis = '🎬 *Cartelera Disponible:*\n\n'; 
            res.rows.forEach(p => {
                listaPelis += `ID: *${p.id}* - ${p.titulo} (${p.horario})\n`;
            });
            msg.reply(listaPelis + '\n👉 *Envía solo el número de ID* de la película que deseas ver:');
            sesiones[fone] = { paso: 'eligiendo_pelicula' }; 
            return;
        } 

        // Flujo de Reservación del Cliente
        if (sesiones[fone]?.paso === 'eligiendo_pelicula') { 
            sesiones[fone] = { paso: 'esperando_nombre', peliculaId: chat }; 
            msg.reply('Excelente elección. ¿A nombre de quién hacemos la reserva? (Nombre y Apellido)'); 
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
            if(isNaN(can)) return msg.reply('Por favor, envía un número válido.');
            
            // Guardar reserva en Neon
            const r = await pool.query(
                'INSERT INTO reservas (telefono_cliente, nombre_cliente, pelicula_id, cantidad_personas) VALUES ($1,$2,$3,$4) RETURNING id', 
                [fone, sesiones[fone].nombre, sesiones[fone].peliculaId, can]
            );
            
            // Restar espacios disponibles
            await pool.query('UPDATE peliculas SET cupos_disponibles = cupos_disponibles - $1 WHERE id = $2', [can, sesiones[fone].peliculaId]);
            
            // Generar la Imagen del QR del Ticket
            const link = `https://wa.me/${numeroDelBot}?text=*validar%20${r.rows[0].id}*`;
            const qrTicket = await qrcodeImg.toDataURL(link);
            const media = new MessageMedia('image/png', qrTicket.split(',')[1], 'ticket.png');
            
            // Enviar Ticket Final
            await client.sendMessage(msg.from, media, { 
                caption: `✅ *RESERVA CONFIRMADA*\n\n👤 A nombre de: ${sesiones[fone].nombre}\n👥 Espacios: ${can}\n🎫 Número de Ticket: #${r.rows[0].id}\n\nPresenta este código QR en la entrada del cine.` 
            });
            delete sesiones[fone]; 
            return;
        }

        // Preguntas frecuentes
        if (chat === '2') { 
            msg.reply('🎥 Nuestra entrada es totalmente gratis. El proyecto cultural se sostiene gracias a nuestra Dulcería 🍿. ¡Llega temprano, compra tus snacks y apóyanos!'); 
        } 
        else if (chat === '3') { 
            msg.reply('📍 *Ubicación*\nAntigua sala de cine, Mall Plaza Paraíso.\nWaze: https://waze.com/ul?q=Mall+Plaza+Paraiso'); 
        } 

    } catch (e) { 
        console.log("❌ Error en el flujo del mensaje:", e.message); 
    }
});

// Arrancar el Bot
client.initialize();

// ==========================================
// 🌐 6. SERVIDOR WEB PÚBLICO
// ==========================================
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.write(htmlContenido);
    res.end();
}).listen(process.env.PORT || 10000);
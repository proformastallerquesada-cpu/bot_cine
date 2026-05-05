const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcodeImg = require('qrcode');
const { Pool } = require('pg');
const http = require('http');

// ============================================================================
// 🛡️ MÓDULO 1: PROTECCIÓN
// ============================================================================
process.on('unhandledRejection', error => { 
    console.log('⚠️ Promesa ignorada:', error.message); 
});
process.on('uncaughtException', error => { 
    console.log('💥 Error evitado:', error.message); 
});

// ============================================================================
// 🗄️ MÓDULO 2: BASE DE DATOS (NEON)
// ============================================================================
const pool = new Pool({
    connectionString: process.env.DATABASE_URL, 
    ssl: { rejectUnauthorized: false }
});

// ============================================================================
// 🚀 MÓDULO 3: CONFIGURACIÓN (CON CAMBIO DE IDENTIDAD PARA EVITAR CORRUPCIÓN)
// ============================================================================
console.log("⏳ [1/4] Configurando cliente de WhatsApp...");

const client = new Client({
    // 🔥 EL TRUCO MAESTRO: Le damos un ID nuevo para que cree una carpeta limpia y fresca.
    authStrategy: new LocalAuth({ clientId: 'cine-oficial-v1' }),
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox', 
            '--disable-setuid-sandbox', 
            '--disable-dev-shm-usage', 
            '--disable-gpu',
            '--no-zygote'
        ],
        timeout: 60000 // Le damos 60 segundos máximos para arrancar o que tire error.
    }
});

let sesiones = {}; 
let htmlContenido = "<h2 style='text-align:center;font-family:Arial;margin-top:50px;'>⚙️ Cargando Sistema de Cine...</h2>";
const numeroDelBot = '50664797833'; 
const port = process.env.PORT || 10000;

// ============================================================================
// 📸 MÓDULO 4: EVENTOS DE WHATSAPP
// ============================================================================
client.on('qr', async (qr) => {
    try {
        console.log("✅ [3/4] WhatsApp solicitó un Código QR. Generando imagen...");
        const qrImage = await qrcodeImg.toDataURL(qr);
        htmlContenido = `
            <div style="text-align:center;margin-top:40px;font-family:Arial;">
                <h1 style="color:#075e54;">🍿 La Fábrica de los Sueños</h1>
                <p>Escanea este código con tu WhatsApp Business.</p>
                <img src="${qrImage}" style="width:300px;height:300px;border:4px solid #075e54;border-radius:15px;" />
            </div>`;
        console.log('--- 🔄 NUEVO CÓDIGO QR LISTO EN LA PÁGINA WEB ---');
    } catch (e) {
        console.log("❌ Error generando QR:", e.message);
    }
});

client.on('authenticated', () => { 
    console.log('✅ [3/4] SESIÓN AUTENTICADA. Credenciales limpias guardadas.'); 
});

client.on('ready', () => { 
    console.log('🚀 [4/4] SISTEMA ONLINE - RECIBIENDO MENSAJES'); 
    htmlContenido = `
        <div style="text-align:center;margin-top:50px;font-family:Arial;">
            <h1 style="color:#28a745;">✅ ¡Bot Conectado y En Línea!</h1>
            <p>El sistema automático de taquilla está operando 24/7 en Render.</p>
        </div>`;
});

// ============================================================================
// 🧠 MÓDULO 5: LÓGICA DEL BOT (RESUMIDA)
// ============================================================================
client.on('message', async msg => {
    try {
        if (!msg.body) return;
        const chat = msg.body.toLowerCase().trim();
        let fone = msg.from.split('@')[0]; 

        if (['reset', 'hola', 'menu', 'inicio', 'buenas'].includes(chat)) {
            delete sesiones[fone];
            return msg.reply(
                '🍿 *Cine Club La Fábrica de los Sueños* 🎬\n\n' +
                '¡Hola! Soy tu asistente de taquilla. Elige una opción:\n\n' +
                '*1.* 🎟️ Ver Cartelera y Reservar\n' +
                '*2.* ❓ ¿Cómo funciona?\n' +
                '*3.* 📍 Ubicación\n' +
                '*4.* 👤 Administración'
            );
        }

        if (sesiones[fone] && sesiones[fone].paso) {
            const paso = sesiones[fone].paso;

            if (paso === 'eligiendo_pelicula') { 
                const id = parseInt(chat);
                if(isNaN(id)) return msg.reply('⚠️ Envía solo el número de ID.');
                sesiones[fone] = { paso: 'esperando_nombre', peliculaId: id }; 
                return msg.reply('¿A nombre de quién hacemos la reserva?'); 
            }
            else if (paso === 'esperando_nombre') { 
                sesiones[fone].nombre = msg.body; 
                sesiones[fone].paso = 'eligiendo_cantidad'; 
                return msg.reply(`Perfecto, ${sesiones[fone].nombre}. ¿Cuántos espacios necesitas?`); 
            }
            else if (paso === 'eligiendo_cantidad') {
                const cant = parseInt(chat);
                if(isNaN(cant)) return msg.reply('⚠️ Envía solo el número.');
                try {
                    msg.reply('⏳ Procesando reserva...');
                    const r = await pool.query('INSERT INTO reservas (telefono_cliente, nombre_cliente, pelicula_id, cantidad_personas) VALUES ($1,$2,$3,$4) RETURNING id', [fone, sesiones[fone].nombre, sesiones[fone].peliculaId, cant]);
                    await pool.query('UPDATE peliculas SET cupos_disponibles = cupos_disponibles - $1 WHERE id = $2', [cant, sesiones[fone].peliculaId]);
                    
                    const linkValidacion = `https://wa.me/${numeroDelBot}?text=*validar%20${r.rows[0].id}*`;
                    const qrTicket = await qrcodeImg.toDataURL(linkValidacion);
                    const media = new MessageMedia('image/png', qrTicket.split(',')[1], 'ticket.png');
                    
                    await client.sendMessage(msg.from, media, { 
                        caption: `✅ *RESERVA EXITOSA*\n👤 Titular: ${sesiones[fone].nombre}\n👥 Espacios: ${cant}\n🎫 Ticket: #${r.rows[0].id}\n\n⚠️ Muestra este QR al llegar.` 
                    });
                    delete sesiones[fone]; 
                } catch(e) { msg.reply("❌ Error. Intenta de nuevo."); delete sesiones[fone]; }
                return;
            }
        }

        if (chat === '1') {
            const res = await pool.query('SELECT * FROM peliculas WHERE cupos_disponibles > 0 ORDER BY id ASC');
            if (res.rows.length === 0) return msg.reply('No hay funciones disponibles hoy. 😔');
            let list = '🎬 *CARTELERA DISPONIBLE:*\n\n'; 
            res.rows.forEach(p => list += `👉 *ID: ${p.id}* - ${p.titulo}\n🕒 ${p.horario} | 🪑: ${p.cupos_disponibles}\n\n`);
            sesiones[fone] = { paso: 'eligiendo_pelicula' }; 
            return msg.reply(list + 'Responde con el número de ID de la película:');
        }
        if (chat === '2') return msg.reply('🎥 *¿CÓMO FUNCIONA?*\nEntrada gratuita. Mantenemos el cine gracias a tus compras en la Dulcería 🍿.');
        if (chat === '3') return msg.reply('📍 *UBICACIÓN*\nMall Plaza Paraíso. 🚗 Waze: https://waze.com/ul?q=Mall+Plaza+Paraiso');
        if (chat === '4') return msg.reply('👤 *ADMIN*\nGerencia: 👉 https://wa.me/50688734753');

    } catch (e) { console.log("❌ ERROR:", e.message); }
});

// ============================================================================
// 🔥 ENCENDIDO Y SERVIDOR WEB
// ============================================================================

console.log("⚙️ [2/4] Enviando orden de encendido al navegador...");
client.initialize()
    .then(() => console.log("✔️ Navegador Chrome iniciado con éxito."))
    .catch(err => console.log("❌ ERROR FATAL AL INICIAR CHROME:", err));

http.createServer((req, res) => {
    try {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.write(htmlContenido);
        res.end();
    } catch (err) {
        res.writeHead(500);
        res.end("Error en el servidor");
    }
}).listen(port, '0.0.0.0', () => {
    console.log(`🌐 Servidor Web escuchando en puerto ${port} (Health Check de Render OK)`);
});
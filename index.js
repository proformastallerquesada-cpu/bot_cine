// ============================================================================
// 📦 IMPORTACIONES Y VARIABLES GLOBALES (BLINDADAS AL INICIO)
// ============================================================================
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcodeImg = require('qrcode');
const { Pool } = require('pg');
const http = require('http');
const fs = require('fs'); 
const path = require('path'); 

// Variables de estado (Definidas al inicio para evitar el error "not defined")
let sesiones = {}; 
let htmlContenido = "<h2 style='text-align:center;font-family:Arial;margin-top:50px;color:#333;'>⚙️ Inicializando Sistema de Cine... (Por favor espera 2-3 minutos)</h2>";
const numeroDelBot = '50664797833'; 
const port = process.env.PORT || 10000;

// ============================================================================
// 🧹 MÓDULO 0: SÚPER CONSERJE (LIMPIEZA DE BLOQUEOS DE CHROME)
// ============================================================================
const sessionPath = path.join(process.cwd(), '.wwebjs_auth', 'session');
const lockFiles = ['SingletonLock', 'SingletonCookie', 'SingletonSocket'];

console.log("🧹 Ejecutando Súper Conserje de Render...");
if (fs.existsSync(sessionPath)) {
    lockFiles.forEach(file => {
        const filePath = path.join(sessionPath, file);
        try {
            fs.rmSync(filePath, { force: true }); 
        } catch (e) {
            // Error silencioso
        }
    });
}
console.log("✨ Limpieza completada.");

// ============================================================================
// 🛡️ MÓDULO 1: PROTECCIÓN CONTRA CRASHEOS
// ============================================================================
process.on('unhandledRejection', error => { 
    console.log('⚠️ [PREVENCIÓN] Promesa ignorada:', error.message || error); 
});
process.on('uncaughtException', error => { 
    console.log('💥 [PREVENCIÓN FATAL] Error evitado:', error.message || error); 
});

// ============================================================================
// 🗄️ MÓDULO 2: CONEXIÓN A BASE DE DATOS (NEON POSTGRESQL 17)
// ============================================================================
const pool = new Pool({
    connectionString: process.env.DATABASE_URL, 
    ssl: { rejectUnauthorized: false }
});

// ============================================================================
// 🚀 MÓDULO 3: CONFIGURACIÓN DEL NAVEGADOR (MODO AHORRO EXTREMO)
// ============================================================================
const client = new Client({
    authStrategy: new LocalAuth(),
    authTimeoutMs: 0, 
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox', 
            '--disable-setuid-sandbox', 
            '--disable-dev-shm-usage', 
            '--disable-gpu',
            '--no-zygote',
            '--single-process', // Ahorra el 50% de la RAM
            '--disable-extensions', 
            '--disable-accelerated-2d-canvas',
            '--disable-software-rasterizer',
            '--mute-audio'
        ],
        timeout: 0, 
        protocolTimeout: 0 // Paciencia infinita para Render
    }
});

// ============================================================================
// 📸 MÓDULO 4: EVENTOS DE CONEXIÓN Y QR
// ============================================================================
client.on('qr', async (qr) => {
    try {
        const qrImage = await qrcodeImg.toDataURL(qr);
        htmlContenido = `
            <div style="text-align:center;margin-top:40px;font-family:Arial;">
                <h1 style="color:#075e54;">🍿 Panel de Control: La Fábrica de los Sueños</h1>
                <p style="color:#555;">Escanea este código con tu WhatsApp Business.</p>
                <img src="${qrImage}" style="width:300px;height:300px;border:4px solid #075e54;border-radius:15px;" />
                <p style="color:gray;font-size:12px;margin-top:20px;">El código se actualiza cada 60 segundos por seguridad.</p>
            </div>`;
        console.log('--- 🔄 NUEVO CÓDIGO QR LISTO PARA ESCANEAR ---');
    } catch (e) {
        console.log("❌ Error generando QR:", e.message);
    }
});

client.on('authenticated', () => { 
    console.log('✅ SESIÓN AUTENTICADA. Credenciales a salvo en el disco.'); 
});

client.on('ready', () => { 
    console.log('🚀 SISTEMA ONLINE - RECIBIENDO MENSAJES'); 
    htmlContenido = `
        <div style="text-align:center;margin-top:50px;font-family:Arial;">
            <h1 style="color:#28a745;">✅ ¡Bot Conectado y En Línea!</h1>
            <p>El sistema automático de taquilla está operando 24/7 en Render.</p>
        </div>`;
});

// ============================================================================
// 🧠 MÓDULO 5: LÓGICA DEL BOT (RESUMIDA Y LIMPIA)
// ============================================================================
client.on('message', async msg => {
    try {
        if (!msg.body) return;
        const chat = msg.body.toLowerCase().trim();
        let fone = msg.from.split('@')[0]; 

        // Menú de bienvenida
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

        // --- FLUJO RESERVA ---
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

        // Acciones Rápidas
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
// 🔥 ENCENDIDO Y SERVIDOR WEB (A PRUEBA DE ERRORES)
// ============================================================================
client.initialize();

http.createServer((req, res) => {
    try {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        // Usamos un fallback por si la variable llegara a fallar (aunque ya no debería)
        res.write(htmlContenido || "<h2>Cargando sistema... Refresca en un momento.</h2>");
        res.end();
    } catch (err) {
        res.writeHead(500);
        res.end("Error en el servidor");
    }
}).listen(port, '0.0.0.0', () => {
    console.log(`🌐 Servidor escuchando en puerto ${port}`);
    console.log(`🛡️ Health Check de Render activo.`);
});
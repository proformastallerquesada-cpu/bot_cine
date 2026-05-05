const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcodeImg = require('qrcode');
const { Pool } = require('pg');
const http = require('http');
const fs = require('fs'); 
const path = require('path'); 

// ============================================================================
// 🧹 MÓDULO 0: SÚPER CONSERJE (ELIMINADOR DE BLOQUEOS FANTASMA)
// ============================================================================
const sessionPath = path.join(process.cwd(), '.wwebjs_auth', 'session');
const lockFiles = ['SingletonLock', 'SingletonCookie', 'SingletonSocket'];

console.log("🧹 Ejecutando Súper Conserje de Render...");
lockFiles.forEach(file => {
    const filePath = path.join(sessionPath, file);
    try {
        fs.rmSync(filePath, { force: true }); 
    } catch (e) {
        // Silencioso si no hay nada que borrar
    }
});
console.log("✨ Limpieza completada. Preparando encendido...");

// ============================================================================
// 🛡️ MÓDULO 1: PROTECCIÓN CONTRA CRASHEOS DEL SERVIDOR
// ============================================================================
process.on('unhandledRejection', error => { 
    console.log('⚠️ [PREVENCIÓN] Promesa ignorada:', error.message || error); 
});
process.on('uncaughtException', error => { 
    console.log('💥 [PREVENCIÓN FATAL] Error evitado:', error.message || error); 
});

// ============================================================================
// 🗄️ MÓDULO 2: CONEXIÓN SEGURA A NEON (POSTGRESQL 17)
// ============================================================================
const pool = new Pool({
    connectionString: process.env.DATABASE_URL, 
    ssl: { rejectUnauthorized: false }
});

// ============================================================================
// 🚀 MÓDULO 3: CONFIGURACIÓN DEL NAVEGADOR (DIETA ESTRICTA Y PACIENCIA)
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
            '--single-process', 
            '--disable-extensions', 
            '--disable-accelerated-2d-canvas',
            '--disable-software-rasterizer',
            '--mute-audio', 
            '--disable-background-networking',
            '--disable-default-apps'
        ],
        timeout: 0, 
        protocolTimeout: 0 // Paciencia infinita para que Render logre cargar WhatsApp
    }
});

// ============================================================================
// 💾 VARIABLES GLOBALES (¡Aquí estaba el error, ya está corregido!)
// ============================================================================
let sesiones = {}; 
let htmlContenido = "<h2 style='text-align:center;font-family:Arial;margin-top:50px;color:#333;'>⚙️ Inicializando Sistema de Cine... (Por favor espera unos minutos)</h2>";
const numeroDelBot = '50664797833'; 

// ============================================================================
// 📸 MÓDULO 4: EVENTOS DE WHATSAPP (QR Y CONEXIÓN)
// ============================================================================
client.on('qr', async (qr) => {
    try {
        const qrImage = await qrcodeImg.toDataURL(qr);
        htmlContenido = `
            <div style="text-align:center;margin-top:40px;font-family:Arial;">
                <h1 style="color:#075e54;">🍿 Panel de Control: La Fábrica de los Sueños</h1>
                <p style="color:#555;">Por favor, escanea el código QR con tu WhatsApp Business.</p>
                <img src="${qrImage}" style="width:300px;height:300px;border:4px solid #075e54;border-radius:15px;box-shadow: 0px 4px 10px rgba(0,0,0,0.2);" />
                <p style="color:gray;font-size:12px;margin-top:20px;">Nota: Es normal que el código cambie cada 60 segundos por seguridad.</p>
            </div>`;
        console.log('--- 🔄 NUEVO CÓDIGO QR GENERADO ---');
    } catch (e) {
        console.log("❌ Error generando interfaz gráfica del QR:", e.message);
    }
});

client.on('authenticated', () => { 
    console.log('✅ SESIÓN AUTENTICADA CORRECTAMENTE. Credenciales guardadas en disco.'); 
});

client.on('ready', () => { 
    console.log('🚀 SISTEMA SAAS DE CINE CORRIENDO AL 100% - LISTO PARA RECIBIR MENSAJES'); 
    htmlContenido = `
        <div style="text-align:center;margin-top:50px;font-family:Arial;">
            <h1 style="color:#28a745;">✅ ¡Bot Conectado y En Línea!</h1>
            <p>El sistema automático de taquilla está operando en Render 24/7.</p>
            <p style="color:gray;">Ya puedes cerrar esta ventana con seguridad.</p>
        </div>`;
});

// ============================================================================
// 🧠 MÓDULO 5: LÓGICA DE RESPUESTAS DEL BOT
// ============================================================================
client.on('message', async msg => {
    try {
        if (!msg.body) return; 

        console.log(`📩 Mensaje entrante de [${msg.from}]: ${msg.body}`); 
        
        const chat = msg.body.toLowerCase().trim();
        let fone = msg.from.split('@')[0]; 

        if (['reset', 'hola', 'menu', 'inicio', 'buenas', 'buenos dias', 'buenas tardes'].includes(chat)) {
            delete sesiones[fone]; 
            
            if(chat === 'reset') {
                return msg.reply('🔄 Tu sesión ha sido reiniciada. Escribe "hola" para volver a empezar.');
            }
            
            const mensajeBienvenida = 
                '🍿 *Cine Club La Fábrica de los Sueños* 🎬\n\n' +
                '¡Hola! Bienvenido a nuestra taquilla automática. Responde con el número de la opción:\n\n' +
                '*1.* 🎟️ Ver Cartelera y Reservar entradas\n' +
                '*2.* ❓ ¿Cómo funciona nuestro cine? (Evacuar dudas)\n' +
                '*3.* 📍 Ubicación y Horarios de atención\n' +
                '*4.* 👤 Hablar con Administración';
                
            return msg.reply(mensajeBienvenida);
        }

        if (sesiones[fone] && sesiones[fone].paso) {
            const pasoActual = sesiones[fone].paso;

            if (pasoActual === 'menu_admin') {
                if (chat === '1') { sesiones[fone].paso = 'admin_titulo'; return msg.reply('🎬 Título:'); }
                if (chat === '2') {
                    try {
                        const r = await pool.query('SELECT id, titulo, cupos_disponibles FROM peliculas');
                        let lista = '🎬 *CARTELERA:*\n\n'; 
                        r.rows.forEach(p => lista += `🔹 ID: ${p.id} | ${p.titulo} | 🪑: ${p.cupos_disponibles}\n`);
                        msg.reply(lista); delete sesiones[fone]; 
                    } catch (e) { msg.reply('❌ Error DB'); delete sesiones[fone]; }
                    return;
                }
            }
            
            else if (pasoActual === 'eligiendo_pelicula') { 
                const id = parseInt(chat);
                if(isNaN(id)) return msg.reply('⚠️ Envía solo el número de ID.');
                sesiones[fone] = { paso: 'esperando_nombre', peliculaId: id }; 
                return msg.reply('¡Excelente! ¿A nombre de quién hacemos la reserva?'); 
            }
            else if (pasoActual === 'esperando_nombre') { 
                sesiones[fone].nombre = msg.body; 
                sesiones[fone].paso = 'eligiendo_cantidad'; 
                return msg.reply(`Perfecto, ${sesiones[fone].nombre}. ¿Cuántos campos necesitas?`); 
            }
            else if (pasoActual === 'eligiendo_cantidad') {
                const cant = parseInt(chat);
                if(isNaN(cant)) return msg.reply('⚠️ Envía solo el número.');
                try {
                    msg.reply('⏳ Procesando...');
                    const r = await pool.query('INSERT INTO reservas (telefono_cliente, nombre_cliente, pelicula_id, cantidad_personas) VALUES ($1,$2,$3,$4) RETURNING id', [fone, sesiones[fone].nombre, sesiones[fone].peliculaId, cant]);
                    await pool.query('UPDATE peliculas SET cupos_disponibles = cupos_disponibles - $1 WHERE id = $2', [cant, sesiones[fone].peliculaId]);
                    const linkValidacion = `https://wa.me/${numeroDelBot}?text=*validar%20${r.rows[0].id}*`;
                    const qrTicket = await qrcodeImg.toDataURL(linkValidacion);
                    const media = new MessageMedia('image/png', qrTicket.split(',')[1], 'ticket.png');
                    const txt = `✅ *RESERVA EXITOSA*\n👤 Titular: ${sesiones[fone].nombre}\n👥 Espacios: ${cant}\n🎫 Ticket: #${r.rows[0].id}\n\n⚠️ Presenta el QR al llegar.`;
                    await client.sendMessage(msg.from, media, { caption: txt });
                    delete sesiones[fone]; 
                } catch(e) { msg.reply("❌ Error. Intenta de nuevo."); delete sesiones[fone]; }
                return;
            }
            return; 
        }

        if (chat === '*admin*') {
            sesiones[fone] = { paso: 'menu_admin' };
            return msg.reply('🛠️ *MODO ADMIN*\n1. Agregar\n2. Ver Cartelera\n3. Eliminar\n4. Reporte');
        }

        if (chat.startsWith('*validar ')) {
            const id = parseInt(chat.split(' ')[1]);
            try {
                const ck = await pool.query('SELECT asistio, telefono_cliente, nombre_cliente FROM reservas WHERE id = $1', [id]);
                if (ck.rows.length === 0) return msg.reply('⚠️ No existe.');
                if (ck.rows[0].asistio) return msg.reply('⚠️ Ya usado.');
                await pool.query('UPDATE reservas SET asistio = true WHERE id = $1', [id]);
                msg.reply(`✅ Validado.`); 
                client.sendMessage(`${ck.rows[0].telefono_cliente}@c.us`, `🎟️ ¡Gracias ${ck.rows[0].nombre_cliente}! Disfruta la película. 🍿`);
            } catch (e) { msg.reply('❌ Error conexión.'); }
            return;
        }

        if (chat === '1') {
            try {
                const res = await pool.query('SELECT * FROM peliculas WHERE cupos_disponibles > 0 ORDER BY id ASC');
                if (res.rows.length === 0) return msg.reply('No hay funciones. 😔');
                let list = '🎬 *CARTELERA DISPONIBLE:*\n\n'; 
                res.rows.forEach(p => list += `👉 *ID: ${p.id}* - ${p.titulo}\n🕒 Horario: ${p.horario} | 🪑: ${p.cupos_disponibles}\n\n`);
                sesiones[fone] = { paso: 'eligiendo_pelicula' }; 
                return msg.reply(list + 'Envía el número de ID:');
            } catch (e) { return msg.reply('❌ Error cartelera.'); }
        } 
        
        if (chat === '2') return msg.reply('🎥 *¿CÓMO FUNCIONA?*\nEntrada gratis. Te pedimos apoyarnos comprando en la Dulcería 🍿.'); 
        if (chat === '3') return msg.reply('📍 *UBICACIÓN*\nMall Plaza Paraíso. Antigua sala de cine. 🚗 Waze: https://waze.com/ul?q=Mall+Plaza+Paraiso'); 
        if (chat === '4') return msg.reply('👤 *ADMINISTRACIÓN*\nHabla con el gerente aquí: 👉 https://wa.me/50688734753');

    } catch (e) { console.log("❌ ERROR:", e.message); }
});

// Arrancamos el motor de WhatsApp
client.initialize();

// ============================================================================
// 🌐 MÓDULO 6: SERVIDOR WEB (EVITA REINICIOS DE RENDER)
// ============================================================================
const port = process.env.PORT || 10000;
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.write(htmlContenido);
    res.end();
}).listen(port, '0.0.0.0', () => {
    console.log(`🌐 Servidor escuchando en puerto ${port}`);
    console.log(`🛡️ Health Check de Render activo.`);
});
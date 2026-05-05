const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcodeImg = require('qrcode');
const { Pool } = require('pg');
const http = require('http');

// ============================================================================
// 🛡️ MÓDULO 1: PROTECCIÓN CONTRA CRASHEOS DEL SERVIDOR (RENDER)
// ============================================================================
process.on('unhandledRejection', error => { 
    console.log('⚠️ [PREVENCIÓN] Promesa ignorada:', error.message || error); 
});
process.on('uncaughtException', error => { 
    console.log('💥 [PREVENCIÓN FATAL] Error evitado:', error.message || error); 
});

// ============================================================================
// 🗄️ MÓDULO 2: CONEXIÓN SEGURA A BASE DE DATOS (NEON POSTGRESQL)
// ============================================================================
const pool = new Pool({
    connectionString: process.env.DATABASE_URL, 
    ssl: { rejectUnauthorized: false }
});

// ============================================================================
// 🚀 MÓDULO 3: CONFIGURACIÓN DEL NAVEGADOR WHATSAPP (EQUILIBRIO 512MB RAM)
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
            '--single-process' // Crucial para no saturar los 512MB de Render
        ],
        timeout: 0
    }
});

// Variables Globales de Estado
let sesiones = {}; // Memoria temporal para saber en qué paso está cada cliente
let htmlContenido = "<h2 style='text-align:center;font-family:Arial;margin-top:50px;color:#333;'>⚙️ Inicializando Sistema de Cine...</h2>";
const numeroDelBot = '50664797833'; // Tu número de bot (usado para el QR de las entradas)

// ============================================================================
// 📸 MÓDULO 4: INTERFAZ WEB Y EVENTOS DE CONEXIÓN
// ============================================================================
client.on('qr', async (qr) => {
    try {
        const qrImage = await qrcodeImg.toDataURL(qr);
        htmlContenido = `
            <div style="text-align:center;margin-top:40px;font-family:Arial;">
                <h1 style="color:#075e54;">🍿 Panel de Control: La Fábrica de los Sueños</h1>
                <p style="color:#555;">Por favor, escanea el código QR con el WhatsApp Dual asignado al cine.</p>
                <img src="${qrImage}" style="width:300px;height:300px;border:4px solid #075e54;border-radius:15px;box-shadow: 0px 4px 10px rgba(0,0,0,0.2);" />
                <p style="color:gray;font-size:12px;margin-top:20px;">El código se renueva automáticamente cada 60 segundos por seguridad.</p>
            </div>`;
        console.log('--- 🔄 NUEVO CÓDIGO QR GENERADO PARA VINCULACIÓN ---');
    } catch (e) {
        console.log("❌ Error generando interfaz gráfica del QR:", e.message);
    }
});

client.on('authenticated', () => { 
    console.log('✅ SESIÓN AUTENTICADA CORRECTAMENTE EN LOS SERVIDORES DE WHATSAPP.'); 
});

client.on('ready', () => { 
    console.log('🚀 SISTEMA SAAS DE CINE CORRIENDO AL 100% - LISTO PARA RECIBIR CLIENTES'); 
    htmlContenido = `
        <div style="text-align:center;margin-top:50px;font-family:Arial;">
            <h1 style="color:#28a745;">✅ ¡Bot Conectado y En Línea!</h1>
            <p>El sistema automático de taquilla está operando en la nube 24/7.</p>
            <p style="color:gray;">Ya puedes cerrar esta ventana.</p>
        </div>`;
});

// ============================================================================
// 🧠 MÓDULO 5: CEREBRO LÓGICO DEL BOT (PROCESAMIENTO DE MENSAJES)
// ============================================================================
client.on('message', async msg => {
    try {
        // 1. Filtro de seguridad: Ignorar imágenes sin texto, audios o stickers
        if (!msg.body) return; 

        console.log(`📩 Mensaje entrante de [${msg.from}]: ${msg.body}`); 
        
        const chat = msg.body.toLowerCase().trim();
        let fone = msg.from.split('@')[0]; 

        // --------------------------------------------------------------------
        // 🛑 COMANDOS DE INTERRUPCIÓN (Salen de cualquier flujo actual)
        // --------------------------------------------------------------------
        if (['reset', 'hola', 'menu', 'inicio', 'buenas', 'buenos dias', 'buenas tardes'].includes(chat)) {
            // Limpiamos la memoria por si el cliente dejó una reserva a medias
            delete sesiones[fone]; 
            
            if(chat === 'reset') {
                return msg.reply('🔄 Tu sesión ha sido reiniciada forzosamente. Escribe "hola" para volver a empezar.');
            }
            
            // Envío del Menú Principal
            const mensajeBienvenida = 
                '🍿 *Cine Club La Fábrica de los Sueños* 🎬\n\n' +
                '¡Hola! Bienvenido a nuestra taquilla automática. Responde únicamente con el número de la opción que deseas:\n\n' +
                '*1.* 🎟️ Ver Cartelera y Reservar entradas\n' +
                '*2.* ❓ ¿Cómo funciona el cine gratuito?\n' +
                '*3.* 📍 Ubicación y Horarios de atención\n' +
                '*4.* 👤 Hablar con Administración';
                
            return msg.reply(mensajeBienvenida);
        }

        // --------------------------------------------------------------------
        // ⚙️ SESIONES ACTIVAS: Si el usuario ya está haciendo un proceso
        // --------------------------------------------------------------------
        if (sesiones[fone] && sesiones[fone].paso) {
            const pasoActual = sesiones[fone].paso;

            // --- FLUJO: MODO ADMINISTRADOR ---
            if (pasoActual === 'menu_admin') {
                if (chat === '1') { 
                    sesiones[fone].paso = 'admin_titulo'; 
                    return msg.reply('🎬 *AGREGAR PELÍCULA*\nPor favor, escribe el Título de la película:'); 
                }
                if (chat === '2') {
                    try {
                        const r = await pool.query('SELECT id, titulo, horario, cupos_disponibles FROM peliculas');
                        if (r.rows.length === 0) { 
                            msg.reply('⚠️ La cartelera está vacía en este momento.'); 
                            delete sesiones[fone]; 
                            return; 
                        }
                        let lista = '🎬 *CARTELERA ACTUAL EN BASE DE DATOS:*\n\n'; 
                        r.rows.forEach(p => { 
                            lista += `🔹 ID: ${p.id} | ${p.titulo}\n🕒 Horario: ${p.horario} | 🪑 Cupos: ${p.cupos_disponibles}\n\n`; 
                        });
                        msg.reply(lista); 
                        delete sesiones[fone]; 
                    } catch (e) {
                        msg.reply('❌ Error consultando la base de datos.'); delete sesiones[fone];
                    }
                    return;
                }
                if (chat === '3') {
                    try {
                        const r = await pool.query('SELECT id, titulo FROM peliculas');
                        let lista = '🗑️ *ELIMINAR PELÍCULA*\nResponde con el número de ID para eliminar:\n\n'; 
                        r.rows.forEach(p => lista += `ID: ${p.id} - ${p.titulo}\n`);
                        sesiones[fone].paso = 'admin_eliminar_pelicula'; 
                        msg.reply(lista); 
                    } catch (e) {
                        msg.reply('❌ Error consultando la base de datos.'); delete sesiones[fone];
                    }
                    return;
                }
                if (chat === '4') {
                    try {
                        const r = await pool.query('SELECT COUNT(id) as t, SUM(cantidad_personas) as p FROM reservas');
                        msg.reply(`💰 *REPORTE DE TAQUILLA*\n\n🎫 Tickets Emitidos Totales: ${r.rows[0].t}\n👥 Personas Esperadas Totales: ${r.rows[0].p || 0}`);
                    } catch (e) {
                        msg.reply('❌ Error generando reporte.');
                    }
                    delete sesiones[fone]; 
                    return;
                }
                return; // Evita que un comando no válido haga algo
            }
            
            // Sub-pasos del Administrador
            else if (pasoActual === 'admin_titulo') { 
                sesiones[fone].titulo = msg.body; 
                sesiones[fone].paso = 'admin_horario'; 
                return msg.reply('⏰ Excelente. Ahora escribe el Horario (Ejemplo: Sábado 7:30 PM):'); 
            }
            else if (pasoActual === 'admin_horario') { 
                sesiones[fone].horario = msg.body; 
                sesiones[fone].paso = 'admin_cupos'; 
                return msg.reply('🪑 Por último, escribe la cantidad de cupos totales disponibles en la sala (Ejemplo: 150):'); 
            }
            else if (pasoActual === 'admin_cupos') {
                const cupos = parseInt(chat);
                if (isNaN(cupos)) return msg.reply('⚠️ Debes ingresar un número válido para los cupos.');
                try {
                    await pool.query('INSERT INTO peliculas (titulo, horario, cupo_total, cupos_disponibles) VALUES ($1,$2,$3,$4)', 
                        [sesiones[fone].titulo, sesiones[fone].horario, cupos, cupos]);
                    msg.reply('✅ ¡Éxito! Película agregada correctamente a la cartelera pública.'); 
                } catch(e) {
                    msg.reply('❌ Error guardando en base de datos.');
                }
                delete sesiones[fone]; 
                return;
            }
            else if (pasoActual === 'admin_eliminar_pelicula') {
                try {
                    await pool.query('DELETE FROM reservas WHERE pelicula_id = $1', [chat]);
                    await pool.query('DELETE FROM peliculas WHERE id = $1', [chat]);
                    msg.reply('✅ La película y todas sus reservas han sido eliminadas del sistema.'); 
                } catch(e) {
                    msg.reply('❌ Error eliminando datos.');
                }
                delete sesiones[fone]; 
                return;
            }

            // --- FLUJO: RESERVACIÓN DE CLIENTES ---
            else if (pasoActual === 'eligiendo_pelicula') { 
                const peliculaID = parseInt(chat);
                if(isNaN(peliculaID)) { 
                    return msg.reply('⚠️ Por favor, envía únicamente el *número de ID* que aparece junto a la película.'); 
                }
                // Guardamos el ID en memoria temporal y avanzamos
                sesiones[fone] = { paso: 'esperando_nombre', peliculaId: peliculaID }; 
                return msg.reply('¡Excelente elección! 🍿\n\n¿A nombre de quién hacemos la reserva? (Escribe tu Nombre y Apellido)'); 
            }
            else if (pasoActual === 'esperando_nombre') { 
                sesiones[fone].nombre = msg.body; // Guardamos el nombre tal cual lo escribió
                sesiones[fone].paso = 'eligiendo_cantidad'; 
                return msg.reply(`Perfecto, ${sesiones[fone].nombre}.\n\n¿Cuántos espacios necesitas en total para ti y tus acompañantes? (Envía solo el número)`); 
            }
            else if (pasoActual === 'eligiendo_cantidad') {
                const cantidadPersonas = parseInt(chat);
                if(isNaN(cantidadPersonas)) return msg.reply('⚠️ Debes enviar un número válido de personas.');
                
                try {
                    msg.reply('⏳ Procesando tu reserva, por favor espera un momento...');
                    
                    // 1. Guardar la reserva
                    const r = await pool.query(
                        'INSERT INTO reservas (telefono_cliente, nombre_cliente, pelicula_id, cantidad_personas) VALUES ($1,$2,$3,$4) RETURNING id', 
                        [fone, sesiones[fone].nombre, sesiones[fone].peliculaId, cantidadPersonas]
                    );
                    
                    // 2. Descontar los cupos
                    await pool.query(
                        'UPDATE peliculas SET cupos_disponibles = cupos_disponibles - $1 WHERE id = $2', 
                        [cantidadPersonas, sesiones[fone].peliculaId]
                    );
                    
                    // 3. Generar Código QR Visual del Ticket
                    const linkValidacion = `https://wa.me/${numeroDelBot}?text=*validar%20${r.rows[0].id}*`;
                    const qrTicket = await qrcodeImg.toDataURL(linkValidacion);
                    const media = new MessageMedia('image/png', qrTicket.split(',')[1], 'ticket.png');
                    
                    // 4. Enviar el Ticket Final al cliente
                    const mensajeTicket = 
                        `✅ *RESERVA CONFIRMADA EXITOSAMENTE*\n\n` +
                        `👤 Titular: ${sesiones[fone].nombre}\n` +
                        `👥 Espacios Reservados: ${cantidadPersonas}\n` +
                        `🎫 Código de Ticket: #${r.rows[0].id}\n\n` +
                        `⚠️ *IMPORTANTE:* Presenta esta imagen con el código QR en la entrada del cine para acceder a la sala. ¡Te esperamos!`;
                        
                    await client.sendMessage(msg.from, media, { caption: mensajeTicket });
                    
                    // Terminamos el proceso
                    delete sesiones[fone]; 
                } catch(e) {
                    console.log("Error creando reserva:", e);
                    msg.reply("⚠️ Hubo un error procesando tu reserva. Es posible que el ID de la película no sea correcto o no haya suficientes espacios. Escribe 'hola' para volver al menú principal.");
                    delete sesiones[fone];
                }
                return;
            }

            // Si está en una sesión pero manda algo raro, no dejamos que caiga al menú principal
            return; 
        }

        // --------------------------------------------------------------------
        // 🚪 MENÚ PRINCIPAL (Solo se ejecuta si el usuario NO está en un proceso)
        // --------------------------------------------------------------------
        
        // Comando Secreto Administrador
        if (chat === '*admin*') {
            sesiones[fone] = { paso: 'menu_admin' };
            return msg.reply('🛠️ *ACCESO CONCEDIDO: MODO ADMINISTRADOR*\n\nResponde con un número:\n1. 🎬 Agregar Película Nueva\n2. 📋 Ver Cartelera Activa\n3. 🗑️ Eliminar Película\n4. 💰 Ver Resumen de Reservas');
        }

        // Comando Secreto Escáner (Validación de Tickets en Puerta)
        if (chat.startsWith('*validar ')) {
            const ticketId = parseInt(chat.split(' ')[1]);
            try {
                const check = await pool.query('SELECT asistio, telefono_cliente, nombre_cliente FROM reservas WHERE id = $1', [ticketId]);
                
                if (check.rows.length === 0) {
                    return msg.reply(`⚠️ ALERTA ROJA: El ticket #${ticketId} no existe en la base de datos. Posible fraude.`);
                }
                if (check.rows[0].asistio) {
                    return msg.reply(`⚠️ ALERTA: El Ticket #${ticketId} YA FUE UTILIZADO ANTERIORMENTE. Entrada denegada.`);
                }
                
                // Actualizamos a que ya entró a la sala
                await pool.query('UPDATE reservas SET asistio = true WHERE id = $1', [ticketId]);
                msg.reply(`✅ *ENTRADA AUTORIZADA*\nTicket #${ticketId} validado correctamente.`); 
                
                // Disparamos el mensaje automático de cortesía para la dulcería
                client.sendMessage(
                    `${check.rows[0].telefono_cliente}@c.us`, 
                    `🎟️ ¡Hola ${check.rows[0].nombre_cliente}! Muchas gracias por acompañarnos hoy en *La Fábrica de los Sueños*. ¡Disfruta la película y no olvides pasar por nuestra dulcería para tus snacks favoritos! 🍿🎬`
                );
            } catch (e) {
                msg.reply('❌ Error de conexión al validar el ticket.');
            }
            return;
        }

        // Opciones Públicas
        if (chat === '1') {
            try {
                msg.reply('🔍 Buscando funciones disponibles...');
                const res = await pool.query('SELECT * FROM peliculas WHERE cupos_disponibles > 0 ORDER BY id ASC');
                
                if (res.rows.length === 0) {
                    return msg.reply('Lo sentimos, en este momento no hay películas con espacios disponibles. 😔');
                }
                
                let listaPeliculas = '🎬 *CARTELERA DISPONIBLE:*\n\n'; 
                res.rows.forEach(p => { 
                    listaPeliculas += `👉 *ID: ${p.id}* - ${p.titulo}\n🕒 Horario: ${p.horario} | 🪑 Espacios: ${p.cupos_disponibles}\n\n`; 
                });
                
                // Activamos el paso para escuchar qué ID quiere
                sesiones[fone] = { paso: 'eligiendo_pelicula' }; 
                return msg.reply(listaPeliculas + 'Para continuar, *envía únicamente el número de ID* de la película que deseas ver:');
            } catch (e) {
                return msg.reply('❌ En este momento estamos actualizando la cartelera, intenta de nuevo en unos minutos.');
            }
        } 
        
        if (chat === '2') { 
            return msg.reply('🎥 *¿CÓMO FUNCIONA?*\n\nNuestro modelo de cine es único y cultural. La entrada a la película es **totalmente gratis**. El mantenimiento de la sala, las licencias y la operación del cine se sostienen *exclusivamente* gracias a nuestra Dulcería 🍿.\n\nPor eso, la única regla es que nos apoyes comprando tus snacks y bebidas con nosotros. ¡Llega temprano para hacer tu pedido!'); 
        } 
        
        if (chat === '3') { 
            return msg.reply('📍 *NUESTRA UBICACIÓN*\n\nNos encontramos en las instalaciones de la antigua sala de cine, dentro del Mall Plaza Paraíso.\n\n🚗 Enlace de Waze: https://waze.com/ul?q=Mall+Plaza+Paraiso'); 
        } 
        
        if (chat === '4') { 
            return msg.reply('👤 *CONTACTO ADMINISTRATIVO*\n\nSi necesitas cancelar una reserva grupal, alquilar la sala para un evento privado, o tienes alguna duda específica, haz clic en el siguiente enlace para hablar directamente con el gerente de operaciones:\n\n👉 https://wa.me/50688734753'); 
        }

    } catch (e) { 
        console.log("❌ ERROR CRÍTICO PROCESANDO EL MENSAJE:", e.message); 
    }
});

client.initialize();

// ============================================================================
// 🌐 MÓDULO 6: SERVIDOR WEB (MANTIENE A RENDER DESPIERTO)
// ============================================================================
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.write(htmlContenido);
    res.end();
}).listen(process.env.PORT || 10000);
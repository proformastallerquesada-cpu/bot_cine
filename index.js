const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcodeTerminal = require('qrcode-terminal');
const qrcodeImg = require('qrcode');
const { Pool } = require('pg');
const cron = require('node-cron');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http'); // Salva-vidas de Render

// --- ☁️ CONEXIÓN A NEON (SEGURA PARA LA NUBE) ---
const pool = new Pool({
    connectionString: process.env.DATABASE_URL, 
    ssl: {
        rejectUnauthorized: false
    }
});

// --- 🤖 NAVEGADOR CONFIGURADO PARA RENDER ---
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process',
            '--disable-gpu'
        ]
    }
});

let sesiones = {};
let tareaCierre; let tareaAsistencia; let tareaCobro;
const numeroDuenio = '50688734753@c.us'; // Número del dueño del cine
const numeroDelBot = '50664797833'; // Tu número del Bot

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

client.on('qr', (qr) => {
    console.log('--- ESCANEA ESTE CÓDIGO QR ---');
    qrcodeTerminal.generate(qr, { small: true });
});

client.on('ready', () => { 
    console.log('✅ Sistema SaaS de Cine listo en la NUBE (Render).'); 
    actualizarProgramacion(); 
});

client.on('message', async msg => {
    try {
        const chat = msg.body.toLowerCase().trim();
        const contacto = await msg.getContact();
        let fone = contacto.number || msg.from.split('@')[0];
        if (fone.includes('lid')) fone = msg.from.split('@')[0];

        const resConf = await pool.query("SELECT clave, valor FROM configuracion WHERE clave IN ('tipo_plan', 'creditos_disponibles', 'fecha_vencimiento')");
        const config = {}; resConf.rows.forEach(r => config[r.clave] = r.valor);

        // --- 🛠️ MODO ADMINISTRADOR ---
        if (chat === '*admin*') {
            sesiones[fone] = { paso: 'menu_admin' };
            msg.reply(
                '🛠️ *MODO ADMIN*\n\n' +
                '1. Películas\n2. Cierre Reservas\n3. Reporte Asistencia\n4. Enviar Asistencia YA\n5. Eliminar Película\n6. Ver Cobro YA\n7. Configurar Cobro\n' +
                `8. Cambiar Plan (Actual: *${config.tipo_plan}*)\n9. 💎 Recargar / Renovar`
            );
            return;
        }

        if (sesiones[fone]) {
            if (sesiones[fone].paso === 'menu_admin') {
                if (chat === '1') { sesiones[fone].paso = 'admin_titulo'; msg.reply('🎬 Título:'); }
                else if (chat === '2') { sesiones[fone].paso = 'conf_dia'; sesiones[fone].tipo = 'cierre'; msg.reply('📅 Día Cierre (1-7):'); }
                else if (chat === '3') { sesiones[fone].paso = 'conf_dia'; sesiones[fone].tipo = 'asistencia'; msg.reply('📅 Día Asistencia (1-7):'); }
                else if (chat === '4') { ejecutarReporte('reporte_asistencia.py', '📋 Asistencia'); delete sesiones[fone]; }
                else if (chat === '5') {
                    const r = await pool.query('SELECT id, titulo FROM peliculas');
                    let l = '🗑️ ID a eliminar:\n'; r.rows.forEach(p => l += `${p.id} - ${p.titulo}\n`);
                    sesiones[fone].paso = 'admin_eliminar_pelicula'; msg.reply(l);
                }
                else if (chat === '6') {
                    const r = await pool.query('SELECT COUNT(id) as t, SUM(cantidad_personas) as p FROM reservas');
                    const c = await pool.query('SELECT COUNT(telefono) as total FROM clientes');
                    msg.reply(`💰 *COBRO Y ESTADÍSTICAS*\nPlan: ${config.tipo_plan}\nTickets: ${r.rows[0].t}\nPersonas: ${r.rows[0].p || 0}\nClientes en Cartera: ${c.rows[0].total}\nCréditos: ${config.creditos_disponibles}\nVence: ${config.fecha_vencimiento || 'N/A'}`);
                    delete sesiones[fone];
                }
                else if (chat === '7') { sesiones[fone].paso = 'admin_mi_numero'; msg.reply('📱 Tu número personal:'); }
                else if (chat === '8') {
                    let nuevoPlan = 'pospago';
                    if (config.tipo_plan === 'pospago') nuevoPlan = 'prepago';
                    else if (config.tipo_plan === 'prepago') nuevoPlan = 'mensual';

                    await pool.query("UPDATE configuracion SET valor = $1 WHERE clave = 'tipo_plan'", [nuevoPlan]);
                    msg.reply(`✅ Plan cambiado a: *${nuevoPlan}*`); delete sesiones[fone];
                }
                else if (chat === '9') {
                    if (config.tipo_plan === 'prepago') {
                        sesiones[fone].paso = 'admin_cargar'; 
                        msg.reply('💎 ¿Cuántos créditos quieres cargar?');
                    } else if (config.tipo_plan === 'mensual') {
                        sesiones[fone].paso = 'admin_renovar_mes';
                        msg.reply(`📅 Vencimiento actual: *${config.fecha_vencimiento || 'No definido'}*\n¿Cuántos días quieres agregarle al plan? (Ej: 30)`);
                    } else {
                        msg.reply('ℹ️ El plan *pospago* es ilimitado y no requiere recargas ni renovación de fechas.');
                        delete sesiones[fone];
                    }
                }
                return;
            }

            if (sesiones[fone].paso === 'admin_cargar') {
                await pool.query("UPDATE configuracion SET valor = valor::int + $1 WHERE clave = 'creditos_disponibles'", [parseInt(chat)]);
                msg.reply('✅ Créditos cargados exitosamente.'); delete sesiones[fone]; return;
            }
            if (sesiones[fone].paso === 'admin_renovar_mes') {
                const dias = parseInt(chat);
                if (isNaN(dias)) return msg.reply('❌ Envía un número válido.');
                const nuevaFecha = new Date(); nuevaFecha.setDate(nuevaFecha.getDate() + dias);
                const fechaStr = nuevaFecha.toISOString().split('T')[0];
                await pool.query("INSERT INTO configuracion (clave, valor) VALUES ('fecha_vencimiento', $1) ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor", [fechaStr]);
                msg.reply(`✅ Plan mensual renovado.\nNueva fecha de vencimiento: *${fechaStr}*`);
                delete sesiones[fone]; return;
            }

            if (sesiones[fone].paso === 'admin_mi_numero') {
                await pool.query("UPDATE configuracion SET valor = $1 WHERE clave = 'numero_personal'", [chat]);
                sesiones[fone].paso = 'conf_dia'; sesiones[fone].tipo = 'cobro'; msg.reply('📅 Día cobro (1-7):'); return;
            }

            if (sesiones[fone].paso === 'conf_dia') { sesiones[fone].dia = chat; sesiones[fone].paso = 'conf_hora'; msg.reply('⏰ Hora (ej: 18:00):'); return; }
            if (sesiones[fone].paso === 'conf_hora') {
                await pool.query(`UPDATE configuracion SET valor = $1 WHERE clave = 'dia_${sesiones[fone].tipo}'`, [sesiones[fone].dia]);
                await pool.query(`UPDATE configuracion SET valor = $1 WHERE clave = 'hora_${sesiones[fone].tipo}'`, [msg.body]);
                await actualizarProgramacion(); msg.reply('✅ Programado.'); delete sesiones[fone]; return;
            }

            if (sesiones[fone].paso === 'admin_eliminar_pelicula') {
                await pool.query('DELETE FROM reservas WHERE pelicula_id = $1', [chat]);
                await pool.query('DELETE FROM peliculas WHERE id = $1', [chat]);
                msg.reply('✅ Eliminada.'); delete sesiones[fone]; return;
            }
            if (sesiones[fone].paso === 'admin_titulo') { sesiones[fone].titulo = msg.body; sesiones[fone].paso = 'admin_horario'; msg.reply('⏰ Horario:'); return; }
            if (sesiones[fone].paso === 'admin_horario') { sesiones[fone].horario = msg.body; sesiones[fone].paso = 'admin_cupos'; msg.reply('🪑 Cupos:'); return; }
            if (sesiones[fone].paso === 'admin_cupos') {
                const c = parseInt(chat);
                await pool.query('INSERT INTO peliculas (titulo, horario, cupo_total, cupos_disponibles) VALUES ($1,$2,$3,$4)', [sesiones[fone].titulo, sesiones[fone].horario, c, c]);
                msg.reply('✅ Película agregada.'); delete sesiones[fone]; return;
            }

            if (sesiones[fone].paso === 'eligiendo_pelicula') {
                const p = await pool.query('SELECT * FROM peliculas WHERE id = $1', [chat]);
                if (p.rows.length > 0) { sesiones[fone] = { paso: 'esperando_nombre', peliculaId: chat }; msg.reply(`¿A nombre de quién hacemos la reserva?`); }
                return;
            }
            if (sesiones[fone].paso === 'esperando_nombre') { sesiones[fone].nombre = msg.body; sesiones[fone].paso = 'eligiendo_cantidad'; msg.reply(`¿Cuántos espacios necesitas?`); return; }
            if (sesiones[fone].paso === 'eligiendo_cantidad') {
                const can = parseInt(chat);
                if (isNaN(can) || can <= 0) return msg.reply('❌ Por favor, envía un número válido.');

                const r = await pool.query('INSERT INTO reservas (telefono_cliente, nombre_cliente, pelicula_id, cantidad_personas) VALUES ($1,$2,$3,$4) RETURNING id', [fone, sesiones[fone].nombre, sesiones[fone].peliculaId, can]);
                await pool.query('UPDATE peliculas SET cupos_disponibles = cupos_disponibles - $1 WHERE id = $2', [can, sesiones[fone].peliculaId]);
                
                try {
                    await pool.query(`
                        INSERT INTO clientes (telefono, nombre) 
                        VALUES ($1, $2) 
                        ON CONFLICT (telefono) DO UPDATE SET 
                            total_reservas = clientes.total_reservas + 1,
                            ultima_visita = CURRENT_TIMESTAMP;
                    `, [fone, sesiones[fone].nombre]);
                } catch (dbErr) { console.error("Error guardando cliente:", dbErr); }

                if (config.tipo_plan === 'prepago') {
                    await pool.query("UPDATE configuracion SET valor = valor::int - 1 WHERE clave = 'creditos_disponibles'");
                }

                const link = `https://wa.me/${numeroDelBot}?text=*validar%20${r.rows[0].id}*`;
                const qr = await qrcodeImg.toDataURL(link);
                const media = new MessageMedia('image/png', qr.split(',')[1], 'ticket.png');
                await client.sendMessage(msg.from, media, { caption: `✅ *RESERVA LISTA*\n👤 ${sesiones[fone].nombre}\n🎫 Ticket: ${r.rows[0].id}` });
                delete sesiones[fone]; return;
            }
        }

        // --- VALIDAR TICKET Y ENVIAR AGRADECIMIENTO ---
        if (chat.startsWith('*validar ')) {
            const id = parseInt(chat.split(' ')[1]);
            if (isNaN(id)) return msg.reply('❌ Formato incorrecto.');

            try {
                const check = await pool.query('SELECT asistio, telefono_cliente, nombre_cliente FROM reservas WHERE id = $1', [id]);
                if (check.rows.length === 0) return msg.reply(`⚠️ No se encontró ningún ticket con el ID #${id}.`);
                if (check.rows[0].asistio) return msg.reply(`⚠️ El ticket #${id} ya fue validado anteriormente.`);

                await pool.query('UPDATE reservas SET asistio = true WHERE id = $1', [id]);
                const telCliente = check.rows[0].telefono_cliente;
                const nombreCli = check.rows[0].nombre_cliente;

                msg.reply(`✅ Entrada Registrada.\nTicket #${id} de ${nombreCli} validado exitosamente.`);

                try {
                    const numDestino = telCliente.includes('@') ? telCliente : `${telCliente}@c.us`;
                    const msjAgradecimiento = `🍿 *¡Gracias por acompañarnos, ${nombreCli}!*\n\nTu entrada ha sido validada con éxito. Esperamos que disfrutes la función en **La Fábrica de los Sueños**.🎬🥤`;
                    await client.sendMessage(numDestino, msjAgradecimiento);
                } catch (sendErr) {
                    console.log("No se pudo enviar el agradecimiento al número:", telCliente);
                }

            } catch (err) { 
                console.error(err); 
                msg.reply('❌ Error interno en la base de datos al validar el ticket.'); 
            }
            return;
        }

        // --- MENÚ BÁSICO DE CLIENTE ---
        if (['hola', 'menú', 'inicio', 'menu'].includes(chat)) {
            delete sesiones[fone];
            msg.reply(
                '🍿 *¡Bienvenido al Auditorio La Fábrica de los Sueños!* 🎬\n' +
                '_Antigua sala de cine de Mall Plaza Paraíso_\n\n' +
                'Responde con el número de la opción:\n\n' +
                '*1.* 🎟️ Ver cartelera y Reservar\n' +
                '*2.* ❓ ¿Cómo funciona la entrada?\n' +
                '*3.* 📍 Ubicación (Waze y Maps)\n' +
                '*4.* 👤 Hablar con el encargado'
            );
            return;
        }

        if (chat === '1') {
            if (config.tipo_plan === 'prepago' && parseInt(config.creditos_disponibles) <= 0) return msg.reply('⚠️ Sistema en mantenimiento.');
            const res = await pool.query('SELECT * FROM peliculas WHERE cupos_disponibles > 0');
            if (res.rows.length === 0) {
                msg.reply('No hay funciones disponibles en este momento.');
            } else {
                let l = '🎬 *Cartelera Disponible:*\n\n';
                res.rows.forEach(p => l += `ID: *${p.id}* - ${p.titulo}\n⏰ ${p.horario}\n🪑 Cupos: ${p.cupos_disponibles}\n\n`);
                msg.reply(l + 'Responde con el número de *ID* de la película.');
                sesiones[fone] = { paso: 'eligiendo_pelicula' };
            }
        } 
        else if (chat === '2') {
            msg.reply('🎥 La entrada a nuestras funciones es completamente **gratuita**. Nos sostenemos 100% gracias a las ventas de nuestra Dulcería 🍿. ¡Apóyanos consumiendo en la barra al llegar!');
        } 
        else if (chat === '3') {
            msg.reply(
                '📍 *Nuestra Ubicación*\nEstamos ubicados en la antigua sala de cine de Mall Plaza Paraíso, Cartago.\n\n🚗 *Abre en Waze:*\nhttps://waze.com/ul?q=Mall+Plaza+Paraiso'
            );
        } 
        else if (chat === '4') {
            msg.reply('👤 *Hablar con el Encargado*\nPuedes enviarle un mensaje haciendo clic aquí:\nhttps://wa.me/50688734753');
        }

    } catch (e) { console.log(e); }
});

client.initialize();

// --- 🛟 SALVAVIDAS PARA RENDER (Keep-Alive) ---
http.createServer((req, res) => {
    res.write("Bot del Cine Activo");
    res.end();
}).listen(process.env.PORT || 8080);
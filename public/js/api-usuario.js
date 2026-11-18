import { supabase } from '../api/config.js';

/* =========================================================
   UTILIDADES
   ========================================================= */
function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// 'YYYY-MM-DD' -> Date en hora local (new Date('2026-11-18') en Argentina daba el día anterior)
function parseFecha(fechaStr) {
    if (!fechaStr) return null;
    if (fechaStr.length === 10) {
        const [y, m, d] = fechaStr.split('-').map(Number);
        return new Date(y, m - 1, d);
    }
    return new Date(fechaStr);
}

function formatearFecha(fechaStr) {
    const f = parseFecha(fechaStr);
    if (!f || isNaN(f)) return 'N/A';
    return f.toLocaleDateString('es-AR', { year: 'numeric', month: 'short', day: 'numeric' });
}

// 'YYYY-MM-DD' de hoy (+ días) en hora local (toISOString usa UTC y adelanta el día a la noche)
function hoyMasDias(dias = 0) {
    const f = new Date();
    f.setDate(f.getDate() + dias);
    const m = String(f.getMonth() + 1).padStart(2, '0');
    const d = String(f.getDate()).padStart(2, '0');
    return `${f.getFullYear()}-${m}-${d}`;
}

function setText(id, texto) {
    const el = document.getElementById(id);
    if (el) el.textContent = texto ?? '';
}

// Muestra el mensaje en el elemento indicado; si no existe, usa alert
function avisar(idMsg, texto) {
    const el = idMsg ? document.getElementById(idMsg) : null;
    if (el) el.textContent = texto;
    else alert(texto);
}

/* =========================================================
   SESIÓN Y CLIENTE
   ========================================================= */
let _user = null;
let _cliente = null;

async function getUser() {
    if (_user) return _user;
    const { data, error } = await supabase.auth.getUser();
    if (error || !data?.user) return null;
    _user = data.user;
    return _user;
}

async function getCliente(userId) {
    if (_cliente?.auth_user_id === userId) return _cliente;
    const { data, error } = await supabase
        .from('clientes')
        .select('id_cliente, auth_user_id, nombre, correo_electronico')
        .eq('auth_user_id', userId)
        .maybeSingle();
    if (error || !data) return null;
    _cliente = data;
    return _cliente;
}

async function getClienteId(userId) {
    return (await getCliente(userId))?.id_cliente ?? null;
}

function irALogin() {
    window.location.href = '../index.html';
}

// Pone al día préstamos vencidos / reservas expiradas (función SQL actualizar_estados)
async function refrescarEstados() {
    try { await supabase.rpc('actualizar_estados'); } catch (e) { /* no es crítico */ }
}

/* =========================================================
   BARRA LATERAL (cerrar sesión + modo oscuro)
   Se llama sola desde cada init, no hace falta tocar los HTML.
   Ajustá 'dark-mode' y 'tema' a lo que use tu dark-mode.css / api-admin.js.
   ========================================================= */
const CLASE_OSCURO = 'dark-mode';
const CLAVE_TEMA = 'tema';

function pintarIconoTema(btn, oscuro) {
    const i = btn?.querySelector('i');
    if (i) i.className = oscuro ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
}

export function initSidebarUsuario() {
    // tema guardado
    let oscuro = false;
    try { oscuro = localStorage.getItem(CLAVE_TEMA) === 'oscuro'; } catch (e) { /* sin storage */ }
    document.body.classList.toggle(CLASE_OSCURO, oscuro);

    const btnTema = document.getElementById('btnDarkMode');
    pintarIconoTema(btnTema, oscuro);
    if (btnTema && !btnTema.dataset.listo) {
        btnTema.dataset.listo = '1';
        btnTema.addEventListener('click', () => {
            const ahora = document.body.classList.toggle(CLASE_OSCURO);
            try { localStorage.setItem(CLAVE_TEMA, ahora ? 'oscuro' : 'claro'); } catch (e) { /* sin storage */ }
            pintarIconoTema(btnTema, ahora);
        });
    }

    // cerrar sesión (botón del sidebar y link de Configuración)
    document.querySelectorAll('#btnLogout, .btn-logout').forEach(btn => {
        if (btn.dataset.listo) return;
        btn.dataset.listo = '1';
        btn.addEventListener('click', async (e) => {
            e.preventDefault();
            await supabase.auth.signOut();
            _user = null;
            _cliente = null;
            irALogin();
        });
    });
}

/* =========================================================
   PRÉSTAMOS Y RESERVAS (lógica compartida)
   ========================================================= */

// El stock, la fecha de devolución y el máximo de libros los controla la base de datos (triggers)
async function crearPrestamo(idCliente, idLibro) {
    return supabase
        .from('prestamos')
        .insert({
            id_cliente: idCliente,
            id_administrador: null,
            id_libro: Number(idLibro),
            estado: 'activo'
        })
        .select('id_prestamo, fecha_prestamo, fecha_devolucion_prevista')
        .single();
}

// Crea la reserva o reactiva una cancelada/expirada. Devuelve { error, yaActiva }
async function crearOReactivarReserva(idCliente, idLibro, fechaLimite) {
    const { data: previa, error: errPrevia } = await supabase
        .from('reservas')
        .select('id_reserva, estado')
        .eq('id_cliente', idCliente)
        .eq('id_libro', idLibro)
        .maybeSingle();

    if (errPrevia) return { error: errPrevia };
    if (previa && (previa.estado === 'pendiente' || previa.estado === 'confirmado')) {
        return { yaActiva: true };
    }

    if (previa) {
        const { error } = await supabase
            .from('reservas')
            .update({ estado: 'pendiente', fecha_reserva: hoyMasDias(0), fecha_limite: fechaLimite })
            .eq('id_reserva', previa.id_reserva);
        return { error };
    }

    const { error } = await supabase.from('reservas').insert({
        id_cliente: idCliente,
        id_libro: Number(idLibro),
        fecha_limite: fechaLimite,
        estado: 'pendiente'
    });
    return { error };
}

function pintarFavorito(btn, activo) {
    btn.classList.toggle('active', activo);
    const icono = btn.querySelector('i');
    if (icono) icono.className = activo ? 'fa-solid fa-heart' : 'fa-regular fa-heart';
}

/* =========================================================
   INICIO
   ========================================================= */
const filtrosInicio = { categoria: null, busqueda: '' };

export async function initInicio() {
    if (!document.getElementById('productosContainer')) return;

    initSidebarUsuario();
    await refrescarEstados();
    await cargarCategorias();
    configurarBusqueda();
    await Promise.all([cargarLibros(), cargarCalendario(), cargarDevoluciones()]);
}

function marcarCategoria(activa) {
    document.querySelectorAll('.categoria').forEach(c => c.classList.toggle('active', c === activa));
}

function configurarBusqueda() {
    const btn = document.getElementById('searchBtn');
    const input = document.getElementById('searchInput');
    const btnVerTodos = document.getElementById('btnVerTodosLibros');
    const btnVerTodas = document.getElementById('btnVerTodas');
    const catContainer = document.getElementById('categoriasContainer');

    const buscar = () => {
        filtrosInicio.busqueda = input ? input.value.trim() : '';
        cargarLibros();
    };

    if (btn) btn.addEventListener('click', buscar);
    if (input) input.addEventListener('keydown', (e) => { if (e.key === 'Enter') buscar(); });

    if (btnVerTodos) {
        btnVerTodos.addEventListener('click', () => {
            if (input) input.value = '';
            filtrosInicio.busqueda = '';
            filtrosInicio.categoria = null;
            marcarCategoria(null);
            cargarLibros();
        });
    }

    if (btnVerTodas) {
        btnVerTodas.addEventListener('click', () => {
            filtrosInicio.categoria = null;
            marcarCategoria(null);
            cargarLibros();
        });
    }

    // un solo listener para todas las categorías (también las que se cargan después)
    if (catContainer) {
        catContainer.addEventListener('click', (e) => {
            const el = e.target.closest('.categoria');
            if (!el) return;
            const id = Number(el.dataset.categoria);
            if (filtrosInicio.categoria === id) {          // segundo click = quitar filtro
                filtrosInicio.categoria = null;
                marcarCategoria(null);
            } else {
                filtrosInicio.categoria = id;
                marcarCategoria(el);
            }
            cargarLibros();
        });
    }
}

async function cargarCategorias() {
    const contenedor = document.getElementById('categoriasContainer');
    if (!contenedor) return;

    const { data, error } = await supabase.from('categorias').select('*').order('nombre_categoria');
    if (error) { contenedor.innerHTML = '<p>Error al cargar categorías.</p>'; return; }
    if (!data?.length) { contenedor.innerHTML = '<p>No hay categorías.</p>'; return; }

    contenedor.innerHTML = data.map(cat =>
        `<span class="categoria" data-categoria="${cat.id_categoria}">${escapeHtml(cat.nombre_categoria)}</span>`
    ).join('');
}

async function cargarLibros() {
    const contenedor = document.getElementById('productosContainer');
    if (!contenedor) return;

    let query = supabase.from('libros').select('*, categorias(nombre_categoria)').order('titulo');

    if (filtrosInicio.categoria) query = query.eq('id_categoria', filtrosInicio.categoria);

    // el buscador dice "título o subtítulo"
    const texto = filtrosInicio.busqueda.replace(/[%,()*]/g, ' ').trim();
    if (texto) query = query.or(`titulo.ilike.%${texto}%,subtitulo.ilike.%${texto}%`);

    const { data, error } = await query;
    if (error) {
        console.error(error);
        contenedor.innerHTML = '<p>Error al cargar los libros.</p>';
        return;
    }
    renderizarLibros(data);
}

async function renderizarLibros(libros) {
    const contenedor = document.getElementById('productosContainer');
    if (!contenedor) return;
    if (!libros?.length) { contenedor.innerHTML = '<p>No hay resultados.</p>'; return; }

    // el botón no va dentro del <a>: así no navega al tocar "Pedir" o el corazón
    contenedor.innerHTML = libros.map(libro => `
        <div class="producto">
            <a class="producto-link" href="ver-libro.html?id=${libro.id_libro}">
                <img src="${escapeHtml(libro.imagen_url || '../imagenes/libro1.png')}"
                     alt="${escapeHtml(libro.titulo)}"
                     onerror="this.onerror=null;this.src='../imagenes/libro1.png'">
                <h4>${escapeHtml(libro.titulo)}</h4>
                <p>${escapeHtml(libro.categorias?.nombre_categoria ?? 'Sin categoría')}</p>
            </a>
            <div class="producto-actions">
                ${libro.stock > 0
                    ? `<button class="btn-prestamo" data-id="${libro.id_libro}" type="button">
                           <i class="fa-solid fa-hand-holding"></i> Pedir
                       </button>`
                    : `<button class="btn-prestamo" type="button" disabled title="Sin stock">Sin stock</button>`}
                <button class="btn-favorito" data-id="${libro.id_libro}" type="button" title="Favorito">
                    <i class="fa-regular fa-heart"></i>
                </button>
            </div>
        </div>
    `).join('');

    contenedor.querySelectorAll('.btn-prestamo[data-id]').forEach(btn =>
        btn.addEventListener('click', () => solicitarPrestamo(btn.dataset.id, btn))
    );
    contenedor.querySelectorAll('.btn-favorito').forEach(btn =>
        btn.addEventListener('click', () => toggleFavorito(btn))
    );

    marcarFavoritos(contenedor);
}

// Pinta el corazón de los libros que ya son favoritos
async function marcarFavoritos(contenedor) {
    const user = await getUser();
    if (!user) return;
    const idCliente = await getClienteId(user.id);
    if (!idCliente) return;

    const { data } = await supabase.from('favoritos').select('id_libro').eq('id_cliente', idCliente);
    const ids = new Set((data ?? []).map(f => f.id_libro));
    contenedor.querySelectorAll('.btn-favorito').forEach(btn =>
        pintarFavorito(btn, ids.has(Number(btn.dataset.id)))
    );
}

async function solicitarPrestamo(idLibro, btn) {
    const user = await getUser();
    if (!user) return alert('Inicia sesión para pedir un libro.');

    const idCliente = await getClienteId(user.id);
    if (!idCliente) return alert('No se encontró tu perfil de cliente.');

    btn.disabled = true;
    const { error } = await crearPrestamo(idCliente, idLibro);
    btn.disabled = false;

    if (error) return alert('No se pudo realizar el préstamo: ' + error.message);

    alert('¡Préstamo realizado!');
    await Promise.all([cargarLibros(), cargarCalendario(), cargarDevoluciones()]);
}

async function toggleFavorito(btn) {
    const user = await getUser();
    if (!user) return alert('Inicia sesión para agregar favoritos.');

    const idCliente = await getClienteId(user.id);
    if (!idCliente) return alert('No se encontró tu perfil de cliente.');

    const idLibro = Number(btn.dataset.id);

    const { data: existe } = await supabase
        .from('favoritos')
        .select('id')
        .eq('id_cliente', idCliente)
        .eq('id_libro', idLibro)
        .maybeSingle();

    if (existe) {
        const { error } = await supabase.from('favoritos').delete().eq('id', existe.id);
        if (error) return alert('Error: ' + error.message);
        pintarFavorito(btn, false);
    } else {
        const { error } = await supabase.from('favoritos').insert({ id_cliente: idCliente, id_libro: idLibro });
        if (error) return alert('Error: ' + error.message);
        pintarFavorito(btn, true);
    }
}

async function cargarCalendario() {
    const contenedor = document.getElementById('calendarioContainer');
    if (!contenedor) return;

    const user = await getUser();
    if (!user) { contenedor.innerHTML = '<p>Inicia sesión.</p>'; return; }

    const idCliente = await getClienteId(user.id);
    if (!idCliente) { contenedor.innerHTML = '<p>Perfil no encontrado.</p>'; return; }

    const { data, error } = await supabase
        .from('prestamos')
        .select('id_prestamo, estado, fecha_devolucion_prevista, libros(titulo)')
        .eq('id_cliente', idCliente)
        .in('estado', ['activo', 'vencido'])
        .order('fecha_devolucion_prevista', { ascending: true });

    if (error) { contenedor.innerHTML = '<p>Error al cargar calendario.</p>'; return; }
    if (!data?.length) { contenedor.innerHTML = '<p>No tienes préstamos activos.</p>'; return; }

    contenedor.innerHTML = data.map(p => `
        <div class="fecha-item">
            <strong>${escapeHtml(p.libros?.titulo ?? 'Libro')}</strong>
            <span>Devolución: ${formatearFecha(p.fecha_devolucion_prevista)}${p.estado === 'vencido' ? ' (vencido)' : ''}</span>
        </div>
    `).join('');
}

async function cargarDevoluciones() {
    const contenedor = document.getElementById('devolucionesContainer');
    if (!contenedor) return;

    const user = await getUser();
    if (!user) { contenedor.innerHTML = '<p>Inicia sesión.</p>'; return; }

    const idCliente = await getClienteId(user.id);
    if (!idCliente) { contenedor.innerHTML = '<p>Perfil no encontrado.</p>'; return; }

    const { data, error } = await supabase
        .from('prestamos')
        .select('id_prestamo, estado, libros(titulo)')
        .eq('id_cliente', idCliente)
        .order('fecha_prestamo', { ascending: false })
        .limit(10);

    if (error) { contenedor.innerHTML = '<p>Error al cargar préstamos.</p>'; return; }
    if (!data?.length) { contenedor.innerHTML = '<p>No tienes préstamos.</p>'; return; }

    contenedor.innerHTML = data.map(p => `
        <div class="prestamo-item">
            <span>${escapeHtml(p.libros?.titulo ?? 'Libro')}</span>
            <span class="estado-badge estado-${escapeHtml(p.estado)}">${escapeHtml(p.estado)}</span>
        </div>
    `).join('');
}

/* =========================================================
   FAVORITOS
   ========================================================= */
export async function initFavoritos() {
    const contenedor = document.getElementById('favListaContainer');
    if (!contenedor) return;

    initSidebarUsuario();

    const user = await getUser();
    if (!user) return irALogin();

    const idCliente = await getClienteId(user.id);
    if (!idCliente) { contenedor.innerHTML = '<p>No se encontró tu perfil de cliente.</p>'; return; }

    const { data, error } = await supabase
        .from('favoritos')
        .select('id, libros(id_libro, titulo, subtitulo, precio, categorias(nombre_categoria))')
        .eq('id_cliente', idCliente);

    if (error) { contenedor.innerHTML = '<p>Error al cargar favoritos.</p>'; return; }

    const contador = document.getElementById('favoritosContador');
    if (contador) contador.textContent = data?.length ?? 0;

    if (!data?.length) { contenedor.innerHTML = '<p>No tienes favoritos.</p>'; return; }

    contenedor.innerHTML = data.map(fav => `
        <div class="fav-item">
            <div class="fav-info">
                <strong><a href="ver-libro.html?id=${fav.libros?.id_libro}">${escapeHtml(fav.libros?.titulo)}</a></strong>
                <span>${escapeHtml(fav.libros?.categorias?.nombre_categoria ?? 'Sin categoría')}</span>
            </div>
            <button class="fav-btn-remove" data-id="${fav.id}" type="button" title="Quitar de favoritos">
                <i class="fa-solid fa-heart-crack"></i>
            </button>
        </div>
    `).join('');

    contenedor.querySelectorAll('.fav-btn-remove').forEach(btn =>
        btn.addEventListener('click', () => quitarFavorito(btn.dataset.id))
    );
}

export async function quitarFavorito(id) {
    if (!confirm('¿Quitar de favoritos?')) return;
    const { error } = await supabase.from('favoritos').delete().eq('id', id);
    if (error) return alert('Error: ' + error.message);
    initFavoritos();
}

/* =========================================================
   RESERVAS
   ========================================================= */
export async function initReservas() {
    const contenedor = document.getElementById('reservasContainer');
    if (!contenedor) return;

    initSidebarUsuario();

    const user = await getUser();
    if (!user) return irALogin();

    const idCliente = await getClienteId(user.id);
    if (!idCliente) { contenedor.innerHTML = '<p>No se encontró tu perfil de cliente.</p>'; return; }

    await refrescarEstados();
    configurarFormReserva(idCliente);
    await cargarMisReservas(idCliente);
}

async function cargarMisReservas(idCliente) {
    const contenedor = document.getElementById('reservasContainer');
    if (!contenedor) return;

    const { data, error } = await supabase
        .from('reservas')
        .select('id_reserva, fecha_reserva, fecha_limite, estado, libros(titulo, categorias(nombre_categoria))')
        .eq('id_cliente', idCliente)
        .order('fecha_reserva', { ascending: false });

    if (error) { contenedor.innerHTML = '<p>Error al cargar reservas.</p>'; return; }
    if (!data?.length) { contenedor.innerHTML = '<p>No tienes reservas activas.</p>'; return; }

    contenedor.innerHTML = data.map(res => `
        <div class="reservar-item">
            <div class="reservar-info">
                <strong>${escapeHtml(res.libros?.titulo ?? 'Libro')}</strong>
                <span>${escapeHtml(res.libros?.categorias?.nombre_categoria ?? 'Sin categoría')}</span>
                <span>Recoger antes del: ${formatearFecha(res.fecha_limite)}</span>
                <span class="estado-reserva">${escapeHtml(res.estado)}</span>
            </div>
            ${(res.estado === 'pendiente' || res.estado === 'confirmado') ? `
                <button class="res-btn" data-id="${res.id_reserva}" type="button" title="Cancelar reserva">
                    <i class="fa-solid fa-bookmark"></i>
                </button>` : ''}
        </div>
    `).join('');

    contenedor.querySelectorAll('.res-btn').forEach(btn =>
        btn.addEventListener('click', () => cancelarReserva(btn.dataset.id))
    );
}

function configurarFormReserva(idCliente) {
    const select = document.getElementById('selectLibroReserva');
    const inputFecha = document.getElementById('inputFechaLimite');
    const btn = document.getElementById('btnCrearReserva');
    if (!select || !btn || btn.dataset.listo) return;   // evita registrar el click dos veces
    btn.dataset.listo = '1';

    if (inputFecha) {
        inputFecha.min = hoyMasDias(1);
        inputFecha.value = hoyMasDias(1);
    }

    supabase.from('libros').select('id_libro, titulo, stock').order('titulo')
        .then(({ data, error }) => {
            if (error || !data) return;
            select.innerHTML = data.map(l =>
                `<option value="${l.id_libro}">${escapeHtml(l.titulo)}${l.stock > 0 ? '' : ' (sin stock)'}</option>`
            ).join('');
        });

    btn.addEventListener('click', async () => {
        const idLibro = Number(select.value);
        const fechaLimite = inputFecha?.value;
        if (!idLibro || !fechaLimite) return avisar('reservaFormMsg', 'Elegí un libro y una fecha.');

        btn.disabled = true;
        setText('reservaFormMsg', 'Registrando reserva...');

        const { error, yaActiva } = await crearOReactivarReserva(idCliente, idLibro, fechaLimite);
        btn.disabled = false;

        if (yaActiva) return setText('reservaFormMsg', 'Ya tienes una reserva para ese libro.');
        if (error) return setText('reservaFormMsg', 'Error: ' + error.message);

        setText('reservaFormMsg', 'Reserva registrada. Te avisaremos cuando esté disponible.');
        cargarMisReservas(idCliente);
    });
}

export async function cancelarReserva(id) {
    if (!confirm('¿Cancelar reserva?')) return;
    const { error } = await supabase
        .from('reservas')
        .update({ estado: 'cancelado' })
        .eq('id_reserva', id);
    if (error) return alert('Error: ' + error.message);

    // solo recarga la lista (volver a llamar initReservas duplicaba el botón "Reservar")
    const user = await getUser();
    const idCliente = user ? await getClienteId(user.id) : null;
    if (idCliente) cargarMisReservas(idCliente);
}

/* =========================================================
   HISTORIAL + NOTIFICACIONES
   ========================================================= */
export async function initHistorial() {
    const contenedor = document.getElementById('historialContainer');
    if (!contenedor) return;

    initSidebarUsuario();

    const user = await getUser();
    if (!user) return irALogin();

    const cliente = await getCliente(user.id);
    if (!cliente) { contenedor.innerHTML = '<p>No se encontró tu perfil de cliente.</p>'; return; }

    await refrescarEstados();

    const botones = document.querySelectorAll('.filtro-btn');
    botones.forEach(btn => {
        btn.addEventListener('click', () => {
            botones.forEach(b => b.classList.remove('activo'));
            btn.classList.add('activo');
            cargarHistorialPorEstado(cliente, btn.dataset.estado);
        });
    });

    const inicial = document.querySelector('.filtro-btn.activo')?.dataset.estado ?? 'devuelto';
    cargarHistorialPorEstado(cliente, inicial);
}

async function cargarHistorialPorEstado(cliente, estado) {
    const contenedor = document.getElementById('historialContainer');
    if (!contenedor) return;
    contenedor.innerHTML = '<p>Cargando historial...</p>';

    const idCliente = cliente.id_cliente;
    let data, error;

    if (estado === 'multa') {
        ({ data, error } = await supabase
            .from('multas')
            .select('id_multa, importe, estado, prestamos!inner(id_prestamo, id_cliente, fecha_devolucion_prevista, libros(titulo, categorias(nombre_categoria)))')
            .eq('prestamos.id_cliente', idCliente));
    } else if (estado === 'reserva') {
        ({ data, error } = await supabase
            .from('reservas')
            .select('id_reserva, fecha_reserva, fecha_limite, estado, libros(titulo, categorias(nombre_categoria))')
            .eq('id_cliente', idCliente)
            .in('estado', ['pendiente', 'confirmado'])
            .order('fecha_reserva', { ascending: false }));
    } else if (estado === 'notificacion') {
        ({ data, error } = await supabase
            .from('notificaciones')
            .select('id, mensaje, tipo, leida, creada_en, libros(titulo)')
            .eq('id_cliente', idCliente)
            .order('creada_en', { ascending: false }));
    } else {
        ({ data, error } = await supabase
            .from('prestamos')
            .select('id_prestamo, estado, fecha_prestamo, fecha_devolucion_prevista, fecha_devolucion_real, libros(titulo, categorias(nombre_categoria))')
            .eq('id_cliente', idCliente)
            .eq('estado', estado)
            .order('fecha_prestamo', { ascending: false }));
    }

    if (error) { console.error(error); contenedor.innerHTML = '<p>Error al cargar el historial.</p>'; return; }
    if (!data?.length) { contenedor.innerHTML = '<p>Sin registros.</p>'; return; }

    if (estado === 'notificacion') return renderNotificaciones(contenedor, data, cliente);
    if (estado === 'reserva') return renderReservasHistorial(contenedor, data);
    renderPrestamosHistorial(contenedor, data, estado);
}

function renderNotificaciones(contenedor, data, cliente) {
    contenedor.innerHTML = data.map(n => `
        <div class="hist-item ${n.leida ? '' : 'notif-no-leida'}">
            <div class="hist-info">
                <strong>${escapeHtml(n.libros?.titulo ?? 'Aviso')}</strong>
                <span>${escapeHtml(n.mensaje)}</span>
                <span>${formatearFecha(n.creada_en)}</span>
                <span class="badge-notif">${escapeHtml(n.tipo)}</span>
            </div>
            ${n.leida ? '' : `<button type="button" class="btn-mini btn-marcar-leida" data-id="${n.id}">Marcar leída</button>`}
        </div>
    `).join('');

    contenedor.querySelectorAll('.btn-marcar-leida').forEach(btn =>
        btn.addEventListener('click', async () => {
            const { error } = await supabase.from('notificaciones').update({ leida: true }).eq('id', btn.dataset.id);
            if (error) return alert('Error: ' + error.message);
            cargarHistorialPorEstado(cliente, 'notificacion');
        })
    );
}

function renderReservasHistorial(contenedor, data) {
    contenedor.innerHTML = data.map(r => `
        <div class="hist-item">
            <div class="hist-info">
                <strong>${escapeHtml(r.libros?.titulo ?? 'Libro')}</strong>
                <span>${escapeHtml(r.libros?.categorias?.nombre_categoria ?? '')}</span>
                <span>Estado: ${escapeHtml(r.estado)}</span>
                <span>Recoger antes del: ${formatearFecha(r.fecha_limite)}</span>
            </div>
        </div>
    `).join('');
}

function renderPrestamosHistorial(contenedor, data, estado) {
    contenedor.innerHTML = data.map(item => {
        const prestamo = estado === 'multa' ? item.prestamos : item;
        const libro = prestamo?.libros;
        const categoria = libro?.categorias?.nombre_categoria ?? '';

        const detalle = estado === 'multa'
            ? `<span>Multa: $${item.importe} (${item.estado})</span>`
            : `<span>Estado: ${escapeHtml(item.estado)}</span>`;

        const devuelto = estado === 'devuelto' && item.fecha_devolucion_real
            ? `<span>Devuelto el: ${formatearFecha(item.fecha_devolucion_real)}</span>`
            : '';

        const botonTicket = estado === 'activo' ? `
            <button type="button" class="btn-mini btn-ver-ticket"
                    data-codigo="PRE-${String(item.id_prestamo).padStart(6, '0')}"
                    data-libro="${escapeHtml(libro?.titulo ?? '')}"
                    data-categoria="${escapeHtml(categoria)}"
                    data-fecha-p="${item.fecha_prestamo}"
                    data-fecha-v="${item.fecha_devolucion_prevista}">
                Ver ticket
            </button>` : '';

        return `
            <div class="hist-item">
                <div class="hist-info">
                    <strong>${escapeHtml(libro?.titulo ?? 'Libro')}</strong>
                    <span>${escapeHtml(categoria)}</span>
                    ${detalle}
                    <span>Devolución prevista: ${formatearFecha(prestamo?.fecha_devolucion_prevista)}</span>
                    ${devuelto}
                </div>
                ${botonTicket}
            </div>
        `;
    }).join('');

    contenedor.querySelectorAll('.btn-ver-ticket').forEach(btn => {
        btn.addEventListener('click', async () => {
            const user = await getUser();
            if (!user) return;
            const cliente = await getCliente(user.id);
            generarTicket({
                codigo: btn.dataset.codigo,
                nombre: cliente?.nombre ?? user.email?.split('@')[0] ?? '',
                correo: user.email ?? '',
                libro: btn.dataset.libro,
                categoria: btn.dataset.categoria,
                fechaPrestamo: btn.dataset.fechaP,
                fechaVencimiento: btn.dataset.fechaV
            });
        });
    });
}

/* =========================================================
   CONFIGURACIÓN
   ========================================================= */
export async function initConfig() {
    if (!document.getElementById('userName')) return;

    initSidebarUsuario();

    const user = await getUser();
    if (!user) return irALogin();

    const cliente = await getCliente(user.id);

    setText('userName', cliente?.nombre ?? user.email?.split('@')[0]);
    setText('userEmail', user.email);

    // cambiar nombre
    const btnNombre = document.getElementById('btnGuardarNombre');
    const inputNombre = document.getElementById('inputNombre');
    if (inputNombre && cliente) inputNombre.value = cliente.nombre;

    if (btnNombre && inputNombre && cliente) {
        btnNombre.addEventListener('click', async () => {
            const nombre = inputNombre.value.trim();
            if (!nombre) return alert('El nombre no puede estar vacío.');

            const { error } = await supabase
                .from('clientes').update({ nombre }).eq('id_cliente', cliente.id_cliente);
            if (error) return alert('Error: ' + error.message);

            cliente.nombre = nombre;               // actualiza la copia en memoria
            setText('userName', nombre);
            alert('Nombre actualizado.');
        });
    }

    // cambiar contraseña (ahora verifica la actual)
    const btnPass = document.getElementById('btnCambiarPass');
    if (btnPass) {
        btnPass.addEventListener('click', async () => {
            const actual = document.getElementById('inputPassActual')?.value;
            const nueva = document.getElementById('inputPassNueva')?.value;
            const confirmacion = document.getElementById('inputPassConfirm')?.value;

            if (!actual) return alert('Ingresa tu contraseña actual.');
            if (!nueva || nueva.length < 6) return alert('La contraseña debe tener al menos 6 caracteres.');
            if (nueva !== confirmacion) return alert('Las contraseñas no coinciden.');

            btnPass.disabled = true;
            const { error: errAuth } = await supabase.auth.signInWithPassword({ email: user.email, password: actual });
            if (errAuth) {
                btnPass.disabled = false;
                return alert('La contraseña actual no es correcta.');
            }

            const { error } = await supabase.auth.updateUser({ password: nueva });
            btnPass.disabled = false;
            if (error) return alert('Error: ' + error.message);

            ['inputPassActual', 'inputPassNueva', 'inputPassConfirm'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.value = '';
            });
            alert('Contraseña actualizada.');
        });
    }
}

/* =========================================================
   VER LIBRO / RESERVAR / TICKET
   ========================================================= */
function mostrarErrorLibro() {
    const cargando = document.getElementById('bookCargando');
    const error = document.getElementById('bookError');
    if (cargando) cargando.style.display = 'none';
    if (error) error.style.display = 'block';
}

function pintarStock(stock) {
    const stockEl = document.getElementById('bookStock');
    if (stockEl) {
        stockEl.style.display = 'block';
        stockEl.textContent = stock > 0 ? `Stock disponible: ${stock}` : 'Sin stock — puedes reservarlo';
    }
    const btnPagar = document.getElementById('btnPagar');
    if (btnPagar) {
        btnPagar.disabled = stock <= 0;
        btnPagar.title = stock <= 0 ? 'Sin stock: usá el botón de reservar' : '';
    }
}

function pintarLibro(libro) {
    setText('bookTitle', libro.titulo);
    setText('bookAuthor', libro.subtitulo ? `por ${libro.subtitulo}` : '');
    setText('bookPrice', `$${libro.precio ?? 0}`);
    setText('bookDescripcion', libro.descripcion || 'Sin descripción disponible.');
    pintarStock(libro.stock);

    const cover = document.getElementById('bookCover');
    if (cover) {
        cover.onerror = () => { cover.onerror = null; cover.src = '../imagenes/libro1.png'; };
        cover.src = libro.imagen_url || '../imagenes/libro1.png';
    }

    const catEl = document.getElementById('bookCategory');
    if (catEl && libro.categorias?.nombre_categoria) {
        catEl.style.display = 'block';
        const badge = catEl.querySelector('.badge-categoria');
        if (badge) badge.textContent = libro.categorias.nombre_categoria;
    }

    const descBox = document.getElementById('bookDescBox');
    if (descBox) descBox.style.display = 'block';

    const mainInfo = document.getElementById('bookMainInfo');
    if (mainInfo) mainInfo.style.display = 'flex';

    const cargando = document.getElementById('bookCargando');
    if (cargando) cargando.style.display = 'none';
}

export async function initVerLibro() {
    if (!document.getElementById('bookTitle')) return;

    initSidebarUsuario();

    const id = new URLSearchParams(window.location.search).get('id');
    if (!id) return (window.location.href = 'inicio.html');

    const { data: libro, error } = await supabase
        .from('libros')
        .select('*, categorias(nombre_categoria)')
        .eq('id_libro', id)
        .maybeSingle();

    if (error || !libro) return mostrarErrorLibro();

    pintarLibro(libro);
    configurarSolicitud(id, libro);
    await configurarReserva(id);
    await configurarFavorito(id);
}

// Botón "Solicitar y generar ticket"
function configurarSolicitud(id, libro) {
    const btnPagar = document.getElementById('btnPagar');
    if (!btnPagar) return;

    btnPagar.addEventListener('click', async () => {
        setText('msgPagar', '');

        const user = await getUser();
        if (!user) return avisar('msgPagar', 'Inicia sesión para pedir un libro.');

        const cliente = await getCliente(user.id);
        if (!cliente) return avisar('msgPagar', 'No se encontró tu perfil de cliente.');

        btnPagar.disabled = true;

        // el stock y la fecha de devolución los resuelve la base de datos
        const { data: prestamo, error } = await crearPrestamo(cliente.id_cliente, id);
        if (error) {
            btnPagar.disabled = false;
            return avisar('msgPagar', 'Error: ' + error.message);
        }

        // si tenía una reserva pendiente de este libro, queda confirmada
        await supabase
            .from('reservas')
            .update({ estado: 'confirmado' })
            .eq('id_cliente', cliente.id_cliente)
            .eq('id_libro', id)
            .eq('estado', 'pendiente');

        // refresca el stock mostrado (también reactiva o bloquea el botón según corresponda)
        const { data: actual } = await supabase.from('libros').select('stock').eq('id_libro', id).maybeSingle();
        pintarStock(actual?.stock ?? 0);

        generarTicket({
            codigo: 'PRE-' + String(prestamo.id_prestamo).padStart(6, '0'),
            nombre: cliente.nombre ?? user.email?.split('@')[0] ?? '',
            correo: user.email ?? '',
            libro: libro.titulo,
            categoria: libro.categorias?.nombre_categoria ?? '',
            fechaPrestamo: prestamo.fecha_prestamo,
            fechaVencimiento: prestamo.fecha_devolucion_prevista
        });

        setText('msgPagar', '¡Préstamo registrado! Se generó tu ticket de retiro.');
    });
}

// Botón "Reservar" (solo avisa cuando haya stock, sin crear préstamo)
async function configurarReserva(id) {
    const btnReservar = document.getElementById('btnReservar');
    if (!btnReservar) return;

    let reservaActiva = false;
    const icono = btnReservar.querySelector('i');
    const pintar = (activa) => {
        reservaActiva = activa;
        btnReservar.classList.toggle('active', activa);
        if (icono) icono.className = activa ? 'fa-solid fa-bookmark' : 'fa-regular fa-bookmark';
    };

    const user = await getUser();
    if (user) {
        const idCliente = await getClienteId(user.id);
        if (idCliente) {
            const { data: previa } = await supabase
                .from('reservas')
                .select('estado')
                .eq('id_cliente', idCliente)
                .eq('id_libro', id)
                .maybeSingle();
            if (previa && (previa.estado === 'pendiente' || previa.estado === 'confirmado')) pintar(true);
        }
    }

    btnReservar.addEventListener('click', async () => {
        const u = await getUser();
        if (!u) return alert('Inicia sesión para reservar.');

        const idCliente = await getClienteId(u.id);
        if (!idCliente) return alert('No se encontró tu perfil de cliente.');

        if (reservaActiva) {
            const { error } = await supabase
                .from('reservas')
                .update({ estado: 'cancelado' })
                .eq('id_cliente', idCliente)
                .eq('id_libro', id);
            if (error) return alert('Error: ' + error.message);
            pintar(false);
            return alert('Reserva cancelada.');
        }

        const { error, yaActiva } = await crearOReactivarReserva(idCliente, id, hoyMasDias(7));
        if (yaActiva) return alert('Ya tienes una reserva activa para este libro.');
        if (error) return alert('Error: ' + error.message);

        pintar(true);
        alert('Reserva registrada. Te avisaremos cuando el libro esté disponible.');
    });
}

// Botón de favorito
async function configurarFavorito(id) {
    const btnFav = document.getElementById('btnFavorito');
    if (!btnFav) return;

    const user = await getUser();
    if (!user) return;
    const idCliente = await getClienteId(user.id);
    if (!idCliente) return;

    const { data: existe } = await supabase
        .from('favoritos')
        .select('id')
        .eq('id_cliente', idCliente)
        .eq('id_libro', id)
        .maybeSingle();

    let favoritoId = existe?.id ?? null;
    pintarFavorito(btnFav, favoritoId !== null);

    btnFav.addEventListener('click', async () => {
        if (favoritoId) {
            const { error } = await supabase.from('favoritos').delete().eq('id', favoritoId);
            if (error) return alert('Error: ' + error.message);
            favoritoId = null;
        } else {
            const { data: nuevo, error } = await supabase
                .from('favoritos')
                .insert({ id_cliente: idCliente, id_libro: Number(id) })
                .select('id')
                .single();
            if (error) return alert('Error: ' + error.message);
            favoritoId = nuevo.id;
        }
        pintarFavorito(btnFav, favoritoId !== null);
    });
}

/* =========================================================
   TICKET DE RETIRO
   ========================================================= */
function generarTicket({ codigo, nombre, correo, libro, categoria, fechaPrestamo, fechaVencimiento }) {
    setText('tkCodigo', codigo);
    setText('tkNombre', nombre);
    setText('tkCorreo', correo);
    setText('tkLibro', libro);
    setText('tkCategoria', categoria);
    setText('tkFechaPrestamo', formatearFecha(fechaPrestamo));
    setText('tkFechaVencimiento', formatearFecha(fechaVencimiento));

    window.print();
}
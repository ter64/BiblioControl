import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '../api/config.js';

export function escapeHtml(texto) {
    return String(texto ?? '').replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}

function parseFecha(fecha) {
    if (!fecha) return null;
    if (String(fecha).length === 10) {
        const [y, m, d] = fecha.split('-').map(Number);
        return new Date(y, m - 1, d);
    }
    return new Date(fecha);
}

export function formatearFecha(fecha) {
    const f = parseFecha(fecha);
    if (!f || isNaN(f)) return '—';
    return f.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function hoyMasDias(dias = 0) {
    const f = new Date();
    f.setDate(f.getDate() + dias);
    const m = String(f.getMonth() + 1).padStart(2, '0');
    const d = String(f.getDate()).padStart(2, '0');
    return `${f.getFullYear()}-${m}-${d}`;
}

function setText(id, valor) {
    const el = document.getElementById(id);
    if (el) el.textContent = valor ?? '';
}

function valor(form, nombre) {
    const el = form.elements[nombre];
    return el ? el.value.trim() : '';
}

function mensajeError(error, textoFK = 'No se puede eliminar: tiene registros asociados.') {
    if (error.code === '23503') return textoFK;
    if (error.code === '23505') return 'Ya existe un registro con esos datos.';
    return 'Error: ' + error.message;
}

function estadoBadge(estado) {
    const e = escapeHtml(estado);
    return `<span class="estado-badge estado-${e}">${e}</span>`;
}

const CONTRASENA_AUTH = 'gestionada-por-supabase-auth';


const CLASE_OSCURO = 'dark-mode';
const CLAVE_TEMA = 'tema';

function pintarIconoTema(btn, oscuro) {
    const i = btn?.querySelector('i');
    if (i) i.className = oscuro ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
}

export function initSidebarAdmin() {
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

    document.querySelectorAll('#btnLogout, .btn-logout').forEach(btn => {
        if (btn.dataset.listo) return;
        btn.dataset.listo = '1';
        btn.addEventListener('click', async (e) => {
            e.preventDefault();
            await supabase.auth.signOut();
            window.location.href = '../index.html';
        });
    });
}

export async function verificarAdmin() {
    const { data, error: errUser } = await supabase.auth.getUser();
    const user = data?.user;

    if (errUser || !user) {
        window.location.href = '../index.html';
        return null;
    }

    const correo = user.email.replace(/[\\%_]/g, '\\$&');
    const { data: admin, error } = await supabase
        .from('administradores')
        .select('*')
        .ilike('correo_electronico', correo)
        .maybeSingle();

    if (error || !admin) {
        alert('Acceso denegado.');
        await supabase.auth.signOut();
        window.location.href = '../index.html';
        return null;
    }

    return { ...admin, email: user.email };
}

async function refrescarEstados() {
    try { await supabase.rpc('actualizar_estados'); } catch (e) { /* no es crítico */ }
}

export async function initInicio() {
    initSidebarAdmin();
    const admin = await verificarAdmin();
    if (!admin) return;

    await refrescarEstados();

    const [libros, prestados, usuarios, atrasados] = await Promise.all([
        supabase.from('libros').select('id_libro', { count: 'exact', head: true }),
        supabase.from('prestamos').select('id_prestamo', { count: 'exact', head: true }).in('estado', ['activo', 'vencido']),
        supabase.from('clientes').select('id_cliente', { count: 'exact', head: true }),
        supabase.from('prestamos').select('id_prestamo', { count: 'exact', head: true }).eq('estado', 'vencido'),
    ]);

    setText('total-libros', libros.count ?? 0);
    setText('libros-prestados', prestados.count ?? 0);
    setText('usuarios-registrados', usuarios.count ?? 0);
    setText('devoluciones-atrasadas', atrasados.count ?? 0);

    const tbodyTop = document.getElementById('tabla-mas-prestados');
    if (tbodyTop) {
        const { data: top, error: errTop } = await supabase
            .from('v_libros_mas_prestados')
            .select('titulo, total_prestamos')
            .order('total_prestamos', { ascending: false })
            .limit(5);

        if (errTop) {
            console.error(errTop);
            tbodyTop.innerHTML = '<tr><td colspan="2">Error al cargar.</td></tr>';
        } else {
            tbodyTop.innerHTML = top.map(l =>
                `<tr><td>${escapeHtml(l.titulo)}</td><td>${l.total_prestamos}</td></tr>`
            ).join('') || '<tr><td colspan="2">Sin datos</td></tr>';
        }
    }

    const estados = ['activo', 'devuelto', 'vencido', 'reservado'];
    const conteos = await Promise.all(estados.map(async (estado) => {
        const { count } = await supabase
            .from('prestamos')
            .select('id_prestamo', { count: 'exact', head: true })
            .eq('estado', estado);
        return { estado, count: count ?? 0 };
    }));

    const tbodyEstados = document.getElementById('tabla-estados');
    if (tbodyEstados) {
        tbodyEstados.innerHTML = conteos
            .map(c => `<tr><td>${estadoBadge(c.estado)}</td><td>${c.count}</td></tr>`)
            .join('');
    }

    // Actividad reciente
    const lista = document.getElementById('lista-actividad');
    if (lista) {
        const { data: actividad, error: errAct } = await supabase
            .from('prestamos')
            .select('fecha_prestamo, estado, clientes(nombre), libros(titulo)')
            .order('id_prestamo', { ascending: false })
            .limit(5);

        if (errAct) {
            console.error(errAct);
            lista.innerHTML = '<li>Error al cargar.</li>';
        } else {
            lista.innerHTML = actividad.map(a => `
                <li>
                    <strong>${escapeHtml(a.libros?.titulo ?? '—')}</strong>
                    - ${escapeHtml(a.estado)}
                    (${escapeHtml(a.clientes?.nombre ?? '—')})
                    · ${formatearFecha(a.fecha_prestamo)}
                </li>
            `).join('') || '<li>Sin actividad.</li>';
        }
    }
}

export async function initLibros() {
    initSidebarAdmin();
    const admin = await verificarAdmin();
    if (!admin) return;

    await Promise.all([cargarLibros(), cargarCategorias()]);

    document.getElementById('form-libro')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const form = e.currentTarget;

        const precio = Number(valor(form, 'precio'));
        if (!(precio > 0)) return alert('El precio debe ser mayor a 0.');

        const libro = {
            titulo: valor(form, 'titulo'),
            subtitulo: valor(form, 'subtitulo') || null,
            id_categoria: valor(form, 'id_categoria') ? parseInt(valor(form, 'id_categoria'), 10) : null,
            precio,
            stock: parseInt(valor(form, 'stock'), 10) || 0,
        };
        if (form.elements['descripcion']) libro.descripcion = valor(form, 'descripcion') || null;
        if (form.elements['imagen_url']) libro.imagen_url = valor(form, 'imagen_url') || null;

        const { error } = await supabase.from('libros').insert(libro);
        if (error) return alert('Error: ' + error.message);

        alert('Libro guardado');
        form.reset();
        cargarLibros();
    });

    document.getElementById('form-categoria')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const nombre = valor(form, 'nombre_categoria');
        if (!nombre) return;

        const { error } = await supabase.from('categorias').insert({ nombre_categoria: nombre });
        if (error) {
            return alert(error.code === '23505' ? 'Esa categoría ya existe.' : 'Error: ' + error.message);
        }

        alert('Categoría guardada');
        form.reset();
        cargarCategorias();
    });

    document.getElementById('tabla-libros')?.addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-eliminar-libro]');
        if (!btn) return;
        if (!confirm('¿Eliminar este libro?')) return;

        const { error } = await supabase.from('libros').delete().eq('id_libro', btn.dataset.eliminarLibro);
        if (error) return alert(mensajeError(error, 'No se puede eliminar: el libro tiene préstamos o reservas registrados.'));
        cargarLibros();
    });

    document.getElementById('tabla-categorias')?.addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-eliminar-categoria]');
        if (!btn) return;
        if (!confirm('¿Eliminar esta categoría?')) return;

        const { error } = await supabase.from('categorias').delete().eq('id_categoria', btn.dataset.eliminarCategoria);
        if (error) return alert(mensajeError(error, 'No se puede eliminar: hay libros en esta categoría.'));
        cargarCategorias();
    });
}

async function cargarLibros() {
    const tbody = document.getElementById('tabla-libros');
    if (!tbody) return;

    const { data, error } = await supabase
        .from('libros')
        .select('*, categorias(nombre_categoria)')
        .order('id_libro');

    if (error) {
        console.error(error);
        tbody.innerHTML = '<tr><td colspan="7">Error al cargar libros.</td></tr>';
        return;
    }

    tbody.innerHTML = data.map(l => `
        <tr>
            <td>${l.id_libro}</td>
            <td>${escapeHtml(l.titulo)}</td>
            <td>${escapeHtml(l.subtitulo)}</td>
            <td>${escapeHtml(l.categorias?.nombre_categoria ?? 'Sin categoría')}</td>
            <td>${l.precio}</td>
            <td>${l.stock}</td>
            <td><button type="button" data-eliminar-libro="${l.id_libro}">Eliminar</button></td>
        </tr>
    `).join('') || '<tr><td colspan="7">Todavía no hay libros.</td></tr>';
}

async function cargarCategorias() {
    const { data, error } = await supabase
        .from('categorias')
        .select('id_categoria, nombre_categoria')
        .order('nombre_categoria');

    if (error) {
        console.error(error);
        const tb = document.getElementById('tabla-categorias');
        if (tb) tb.innerHTML = '<tr><td colspan="2">Error al cargar categorías.</td></tr>';
        return;
    }

    const select = document.querySelector('#form-libro select[name="id_categoria"]');
    if (select) {
        select.innerHTML = '<option value="">Seleccionar categoría</option>' +
            data.map(c => `<option value="${c.id_categoria}">${escapeHtml(c.nombre_categoria)}</option>`).join('');
    }

    const tbody = document.getElementById('tabla-categorias');
    if (tbody) {
        tbody.innerHTML = data.map(c => `
            <tr>
                <td>${escapeHtml(c.nombre_categoria)}</td>
                <td><button type="button" data-eliminar-categoria="${c.id_categoria}">Eliminar</button></td>
            </tr>
        `).join('') || '<tr><td colspan="2">Todavía no hay categorías.</td></tr>';
    }
}

async function crearUsuarioAuth(correo, password, nombre) {
    const aux = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
            storageKey: 'bibliocontrol-alta-usuario'
        }
    });

    const { data, error } = await aux.auth.signUp({
        email: correo,
        password,
        options: { data: { nombre } }
    });

    if (error) return { error };
    if (!data.user || data.user.identities?.length === 0) {
        return { error: { message: 'Ese correo ya está registrado en Supabase Auth.' } };
    }
    return { data };
}

function configurarAlta(idForm, tabla, mensajeOk, recargar) {
    const form = document.getElementById(idForm);
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const nombre = valor(form, 'nombre');
        const correo = valor(form, 'correo').toLowerCase();
        const password = form.elements['contraseña']?.value ?? '';

        if (password.length < 6) return alert('La contraseña debe tener al menos 6 caracteres.');

        const boton = form.querySelector('button[type="submit"]');
        if (boton) boton.disabled = true;

        const { data, error } = await crearUsuarioAuth(correo, password, nombre);
        if (error) {
            if (boton) boton.disabled = false;
            return alert('Error: ' + error.message);
        }

        const { error: errInsert } = await supabase.from(tabla).insert({
            auth_user_id: data.user.id,
            nombre,
            correo_electronico: correo,
            contraseña: CONTRASENA_AUTH
        });

        if (boton) boton.disabled = false;
        if (errInsert) return alert(mensajeError(errInsert));

        alert(mensajeOk);
        form.reset();
        recargar();
    });
}

export async function initUsuarios() {
    initSidebarAdmin();
    const admin = await verificarAdmin();
    if (!admin) return;

    await Promise.all([cargarClientes(), cargarAdministradores(admin)]);

    configurarAlta('form-registrar-cliente', 'clientes', 'Cliente registrado', cargarClientes);
    configurarAlta('form-registrar-admin', 'administradores', 'Administrador registrado', () => cargarAdministradores(admin));

    document.getElementById('tabla-clientes')?.addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-eliminar-cliente]');
        if (!btn) return;
        if (!confirm('¿Eliminar cliente? Se borrarán también sus préstamos, favoritos y reservas.')) return;

        const { error } = await supabase.from('clientes').delete().eq('id_cliente', btn.dataset.eliminarCliente);
        if (error) return alert(mensajeError(error));
        cargarClientes();
    });

    document.getElementById('tabla-administradores')?.addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-eliminar-admin]');
        if (!btn) return;
        if (Number(btn.dataset.eliminarAdmin) === admin.id_administrador) {
            return alert('No podés eliminar tu propio usuario.');
        }
        if (!confirm('¿Eliminar administrador?')) return;

        const { error } = await supabase.from('administradores').delete().eq('id_administrador', btn.dataset.eliminarAdmin);
        if (error) return alert(mensajeError(error, 'No se puede eliminar: tiene préstamos registrados.'));
        cargarAdministradores(admin);
    });
}

async function cargarClientes() {
    const tbody = document.getElementById('tabla-clientes');
    if (!tbody) return;

    const { data, error } = await supabase
        .from('clientes')
        .select('id_cliente, nombre, correo_electronico')
        .order('id_cliente');

    if (error) {
        console.error(error);
        tbody.innerHTML = '<tr><td colspan="4">Error al cargar clientes.</td></tr>';
        return;
    }

    tbody.innerHTML = data.map(u => `
        <tr>
            <td>${u.id_cliente}</td>
            <td>${escapeHtml(u.nombre)}</td>
            <td>${escapeHtml(u.correo_electronico)}</td>
            <td><button type="button" data-eliminar-cliente="${u.id_cliente}">Eliminar</button></td>
        </tr>
    `).join('') || '<tr><td colspan="4">Todavía no hay clientes.</td></tr>';
}

async function cargarAdministradores(admin) {
    const tbody = document.getElementById('tabla-administradores');
    if (!tbody) return;

    const { data, error } = await supabase
        .from('administradores')
        .select('id_administrador, nombre, correo_electronico')
        .order('id_administrador');

    if (error) {
        console.error(error);
        tbody.innerHTML = '<tr><td colspan="4">Error al cargar administradores.</td></tr>';
        return;
    }

    tbody.innerHTML = data.map(a => `
        <tr>
            <td>${a.id_administrador}</td>
            <td>${escapeHtml(a.nombre)}</td>
            <td>${escapeHtml(a.correo_electronico)}</td>
            <td>${a.id_administrador === admin.id_administrador
                ? '—'
                : `<button type="button" data-eliminar-admin="${a.id_administrador}">Eliminar</button>`}</td>
        </tr>
    `).join('');
}

export async function initPrestamos() {
    initSidebarAdmin();
    const admin = await verificarAdmin();
    if (!admin) return;

    await refrescarEstados();
    await Promise.all([cargarFormPrestamo(admin), cargarPrestamos()]);

    // Registrar préstamo
    const form = document.getElementById('form-registrar-prestamo');
    form?.addEventListener('submit', async (e) => {
        e.preventDefault();

        const prestamo = {
            id_cliente: Number(valor(form, 'id_cliente')),
            id_libro: Number(valor(form, 'id_libro')),
            id_administrador: Number(valor(form, 'id_admin')),
            fecha_prestamo: valor(form, 'fecha_prestamo'),
            fecha_devolucion_prevista: valor(form, 'fecha_dev_prevista'),
            estado: 'activo'
        };

        if (prestamo.fecha_devolucion_prevista < prestamo.fecha_prestamo) {
            return alert('La fecha de devolución no puede ser anterior a la del préstamo.');
        }

        const boton = form.querySelector('button[type="submit"]');
        if (boton) boton.disabled = true;
        const { error } = await supabase.from('prestamos').insert(prestamo);
        if (boton) boton.disabled = false;

        if (error) return alert('No se pudo registrar: ' + error.message);

        alert('Préstamo registrado');
        await Promise.all([cargarFormPrestamo(admin), cargarPrestamos()]);
    });

    document.getElementById('tabla-prestamos')?.addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-devolver]');
        if (!btn) return;
        if (!confirm('¿Registrar la devolución de este libro?')) return;

        const { error } = await supabase
            .from('prestamos')
            .update({ estado: 'devuelto' })
            .eq('id_prestamo', btn.dataset.devolver);

        if (error) return alert('Error: ' + error.message);
        await Promise.all([cargarFormPrestamo(admin), cargarPrestamos()]);
    });
}

async function cargarFormPrestamo(admin) {
    const form = document.getElementById('form-registrar-prestamo');
    if (!form) return;

    const [clientes, libros, admins, cfg] = await Promise.all([
        supabase.from('clientes').select('id_cliente, nombre').order('nombre'),
        supabase.from('libros').select('id_libro, titulo, stock').order('titulo'),
        supabase.from('administradores').select('id_administrador, nombre').order('nombre'),
        supabase.from('configuracion').select('dias_prestamo').eq('id', 1).maybeSingle(),
    ]);
    const previo = {
        cliente: valor(form, 'id_cliente'),
        libro: valor(form, 'id_libro'),
        admin: valor(form, 'id_admin'),
    };

    const rellenar = (nombre, filas, texto, vacio, elegido) => {
        const select = form.elements[nombre];
        if (!select || !filas) return;
        select.innerHTML = `<option value="">${vacio}</option>` + filas.map(texto).join('');
        if (elegido) select.value = elegido;
    };

    rellenar('id_cliente', clientes.data,
        c => `<option value="${c.id_cliente}">${escapeHtml(c.nombre)}</option>`,
        'Seleccionar cliente', previo.cliente);
    rellenar('id_libro', libros.data,
        l => `<option value="${l.id_libro}" ${l.stock > 0 ? '' : 'disabled'}>${escapeHtml(l.titulo)} (stock: ${l.stock})</option>`,
        'Seleccionar libro', previo.libro);
    rellenar('id_admin', admins.data,
        a => `<option value="${a.id_administrador}">${escapeHtml(a.nombre)}</option>`,
        'Seleccionar administrador', previo.admin || admin.id_administrador);

    const dias = cfg.data?.dias_prestamo ?? 14;
    if (form.elements['fecha_prestamo'] && !form.elements['fecha_prestamo'].value) {
        form.elements['fecha_prestamo'].value = hoyMasDias(0);
    }
    if (form.elements['fecha_dev_prevista'] && !form.elements['fecha_dev_prevista'].value) {
        form.elements['fecha_dev_prevista'].value = hoyMasDias(dias);
    }
}

async function cargarPrestamos() {
    const tbody = document.getElementById('tabla-prestamos');
    if (!tbody) return;

    const { data, error } = await supabase
        .from('prestamos')
        .select('*, clientes(nombre), libros(titulo)')
        .order('id_prestamo', { ascending: false });

    if (error) {
        console.error(error);
        tbody.innerHTML = '<tr><td colspan="8">Error al cargar préstamos.</td></tr>';
        return;
    }

    tbody.innerHTML = data.map(p => `
        <tr>
            <td>${p.id_prestamo}</td>
            <td>${escapeHtml(p.clientes?.nombre ?? '—')}</td>
            <td>${escapeHtml(p.libros?.titulo ?? '—')}</td>
            <td>${formatearFecha(p.fecha_prestamo)}</td>
            <td>${formatearFecha(p.fecha_devolucion_prevista)}</td>
            <td>${p.fecha_devolucion_real ? formatearFecha(p.fecha_devolucion_real) : 'Pendiente'}</td>
            <td>${estadoBadge(p.estado)}</td>
            <td>${(p.estado === 'activo' || p.estado === 'vencido')
                ? `<button type="button" data-devolver="${p.id_prestamo}">Devolver</button>`
                : '—'}</td>
        </tr>
    `).join('') || '<tr><td colspan="8">Todavía no hay préstamos.</td></tr>';
}

export async function initReportes() {
    initSidebarAdmin();
    const admin = await verificarAdmin();
    if (!admin) return;

    await refrescarEstados();
    await Promise.all([cargarPrestamosParaMulta(), cargarMultas()]);

    const form = document.getElementById('form-multa') ?? document.querySelector('main form');
    if (form) {
        if (form.elements['fecha_multa'] && !form.elements['fecha_multa'].value) {
            form.elements['fecha_multa'].value = hoyMasDias(0);
        }

        form.addEventListener('submit', async (e) => {
            e.preventDefault();

            const multa = {
                id_prestamo: Number(valor(form, 'id_prestamo')),
                fecha_multa: valor(form, 'fecha_multa'),
                importe: Number(valor(form, 'importe')),
                estado: 'pendiente'
            };
            if (!multa.id_prestamo) return alert('Elegí un préstamo.');

            const { error } = await supabase.from('multas').insert(multa);
            if (error) {
                return alert(error.code === '23505'
                    ? 'Ese préstamo ya tiene una multa registrada.'
                    : 'Error: ' + error.message);
            }

            alert('Multa registrada');
            form.reset();
            if (form.elements['fecha_multa']) form.elements['fecha_multa'].value = hoyMasDias(0);
            cargarMultas();
        });
    }

    document.getElementById('tabla-multas')?.addEventListener('click', async (e) => {
        const btnPagar = e.target.closest('[data-pagar-multa]');
        const btnEliminar = e.target.closest('[data-eliminar-multa]');

        if (btnPagar) {
            const { error } = await supabase
                .from('multas')
                .update({ estado: 'pagada' })
                .eq('id_multa', btnPagar.dataset.pagarMulta);
            if (error) return alert('Error: ' + error.message);
            cargarMultas();
        }

        if (btnEliminar) {
            if (!confirm('¿Eliminar esta multa?')) return;
            const { error } = await supabase.from('multas').delete().eq('id_multa', btnEliminar.dataset.eliminarMulta);
            if (error) return alert('Error: ' + error.message);
            cargarMultas();
        }
    });
}

async function cargarPrestamosParaMulta() {
    const select = document.querySelector('select[name="id_prestamo"]');
    if (!select) return;

    const { data, error } = await supabase
        .from('prestamos')
        .select('id_prestamo, clientes(nombre), libros(titulo)')
        .neq('estado', 'devuelto')
        .order('id_prestamo', { ascending: false });

    if (error) { console.error(error); return; }

    select.innerHTML = '<option value="">Seleccionar préstamo</option>' + data.map(p =>
        `<option value="${p.id_prestamo}">${escapeHtml(p.clientes?.nombre ?? '—')} — ${escapeHtml(p.libros?.titulo ?? '—')}</option>`
    ).join('');
}

async function cargarMultas() {
    const tbody = document.getElementById('tabla-multas');
    if (!tbody) return;

    const { data, error } = await supabase
        .from('multas')
        .select('id_multa, fecha_multa, importe, estado, prestamos(clientes(nombre), libros(titulo))')
        .order('fecha_multa', { ascending: false });

    if (error) {
        console.error(error);
        tbody.innerHTML = '<tr><td colspan="6">Error al cargar multas.</td></tr>';
        return;
    }

    tbody.innerHTML = data.map(m => `
        <tr>
            <td>${m.id_multa}</td>
            <td>${escapeHtml(m.prestamos?.clientes?.nombre ?? '—')} — ${escapeHtml(m.prestamos?.libros?.titulo ?? '—')}</td>
            <td>${formatearFecha(m.fecha_multa)}</td>
            <td>$${m.importe}</td>
            <td>${estadoBadge(m.estado)}</td>
            <td>
                ${m.estado === 'pendiente'
                    ? `<button type="button" data-pagar-multa="${m.id_multa}">Marcar pagada</button>`
                    : ''}
                <button type="button" data-eliminar-multa="${m.id_multa}">Eliminar</button>
            </td>
        </tr>
    `).join('') || '<tr><td colspan="6">Todavía no hay multas.</td></tr>';
}

export async function initConfig() {
    initSidebarAdmin();
    const admin = await verificarAdmin();
    if (!admin) return;

    setText('admin-nombre', admin.nombre);
    setText('admin-correo', admin.correo_electronico);

    document.getElementById('form-perfil')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const nombre = valor(form, 'nombre');
        if (!nombre) return;

        const { error } = await supabase
            .from('administradores')
            .update({ nombre })
            .eq('id_administrador', admin.id_administrador);

        if (error) return alert('Error: ' + error.message);
        admin.nombre = nombre;
        setText('admin-nombre', nombre);
        form.reset();
        alert('Perfil actualizado');
    });

    document.getElementById('form-password')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const actual = form.elements['password_actual']?.value ?? '';
        const nueva = form.elements['password_nueva']?.value ?? '';
        const confirmar = form.elements['password_confirmar']?.value ?? '';

        if (!actual) return alert('Ingresá tu contraseña actual.');
        if (nueva.length < 6) return alert('La contraseña debe tener al menos 6 caracteres.');
        if (nueva !== confirmar) return alert('Las contraseñas no coinciden.');

        const { error: errAuth } = await supabase.auth.signInWithPassword({ email: admin.email, password: actual });
        if (errAuth) return alert('La contraseña actual no es correcta.');

        const { error } = await supabase.auth.updateUser({ password: nueva });
        if (error) return alert('Error: ' + error.message);

        alert('Contraseña cambiada.');
        form.reset();
    });

    const formParam = document.getElementById('form-parametros');
    if (formParam) {
        const { data: cfg } = await supabase.from('configuracion').select('*').eq('id', 1).maybeSingle();
        if (cfg) {
            ['dias_prestamo', 'max_libros_cliente', 'multa_diaria'].forEach(campo => {
                if (formParam.elements[campo]) formParam.elements[campo].value = cfg[campo];
            });
        }

        formParam.addEventListener('submit', async (e) => {
            e.preventDefault();

            const cambios = {};
            const dias = valor(formParam, 'dias_prestamo');
            const max = valor(formParam, 'max_libros_cliente');
            const multa = valor(formParam, 'multa_diaria');
            if (dias !== '') cambios.dias_prestamo = parseInt(dias, 10);
            if (max !== '') cambios.max_libros_cliente = parseInt(max, 10);
            if (multa !== '') cambios.multa_diaria = Number(multa);

            if (!Object.keys(cambios).length) return alert('Completá al menos un parámetro.');

            const { error } = await supabase.from('configuracion').update(cambios).eq('id', 1);
            if (error) return alert('Error: ' + error.message);
            alert('Parámetros guardados');
        });
    }
    document.getElementById('btnLimpiarMultasPagadas')?.addEventListener('click', async () => {
        if (!confirm('¿Eliminar TODAS las multas pagadas? No se puede deshacer.')) return;

        const { data, error } = await supabase
            .from('multas').delete().eq('estado', 'pagada').select('id_multa');
        if (error) return alert('Error: ' + error.message);
        alert(`Se eliminaron ${data?.length ?? 0} multas pagadas.`);
    });

    document.getElementById('btnEliminarPrestamosDevueltos')?.addEventListener('click', async () => {
        if (!confirm('¿Eliminar TODOS los préstamos devueltos (y sus multas)? No se puede deshacer.')) return;

        const { data, error } = await supabase
            .from('prestamos').delete().eq('estado', 'devuelto').select('id_prestamo');
        if (error) return alert('Error: ' + error.message);
        alert(`Se eliminaron ${data?.length ?? 0} préstamos devueltos.`);
    });
}
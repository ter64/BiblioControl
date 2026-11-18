import { supabase } from '/api/config.js';

export function escapeHtml(texto) {
    return String(texto ?? '').replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}

export function formatearFecha(fecha) {
    if (!fecha) return '—';
    return new Date(fecha).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function setText(id, valor) {
    const el = document.getElementById(id);
    if (el) el.textContent = valor ?? '';
}

// ---------- Verificación de administrador ----------
export async function verificarAdmin() {
    const { data, error: errUser } = await supabase.auth.getUser();
    const user = data?.user;

    if (errUser || !user) {
        window.location.href = '../index.html';
        return null;
    }

    const { data: admin, error } = await supabase
        .from('administradores')
        .select('*')
        .eq('correo_electronico', user.email)
        .maybeSingle();

    if (error || !admin) {
        alert('Acceso denegado.');
        await supabase.auth.signOut();
        window.location.href = '../index.html';
        return null;
    }

    return admin;
}

// ---------- Admin: Inicio (dashboard) ----------
export async function initInicio() {
    const admin = await verificarAdmin();
    if (!admin) return;

    // Tarjetas de estadísticas
    const [libros, prestados, usuarios, atrasados] = await Promise.all([
        supabase.from('libros').select('id_libro', { count: 'exact', head: true }),
        supabase.from('prestamos').select('id_prestamo', { count: 'exact', head: true }).eq('estado', 'activo'),
        supabase.from('clientes').select('id_cliente', { count: 'exact', head: true }),
        supabase.from('prestamos').select('id_prestamo', { count: 'exact', head: true }).eq('estado', 'vencido'),
    ]);

    setText('total-libros', libros.count ?? 0);
    setText('libros-prestados', prestados.count ?? 0);
    setText('usuarios-registrados', usuarios.count ?? 0);
    setText('devoluciones-atrasadas', atrasados.count ?? 0);

    // Libros más prestados (agrupado en JS, top 5)
    const { data: prestamosLibros, error: errTop } = await supabase
        .from('prestamos')
        .select('id_libro, libros(titulo)');

    const tbodyTop = document.getElementById('tabla-mas-prestados');
    if (tbodyTop && !errTop && prestamosLibros) {
        const conteo = {};
        prestamosLibros.forEach(p => {
            if (!conteo[p.id_libro]) conteo[p.id_libro] = { titulo: p.libros?.titulo ?? '—', prestamos: 0 };
            conteo[p.id_libro].prestamos++;
        });
        const top = Object.values(conteo).sort((a, b) => b.prestamos - a.prestamos).slice(0, 5);
        tbodyTop.innerHTML = top.map(l => `
            <tr><td>${escapeHtml(l.titulo)}</td><td>${l.prestamos}</td></tr>
        `).join('') || '<tr><td colspan="2">Sin datos</td></tr>';
    }

    // Préstamos por estado
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
            .map(c => `<tr><td>${c.estado}</td><td>${c.count}</td></tr>`)
            .join('');
    }

    // Actividad reciente
    const { data: actividad, error: errAct } = await supabase
        .from('prestamos')
        .select('fecha_prestamo, estado, clientes(nombre), libros(titulo)')
        .order('fecha_prestamo', { ascending: false })
        .limit(5);

    const lista = document.getElementById('lista-actividad');
    if (lista && !errAct && actividad) {
        lista.innerHTML = actividad.map(a => `
            <li>
                <strong>${escapeHtml(a.libros?.titulo ?? '—')}</strong>
                - ${escapeHtml(a.estado)}
                (${escapeHtml(a.clientes?.nombre ?? '—')})
                · ${formatearFecha(a.fecha_prestamo)}
            </li>
        `).join('');
    }
}

// ---------- Admin: Libros ----------
export async function initLibros() {
    const admin = await verificarAdmin();
    if (!admin) return;

    await Promise.all([cargarLibros(), cargarCategorias()]);

    // Guardar libro
    document.getElementById('form-libro')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const form = e.currentTarget;

        const libro = {
            titulo: form.titulo.value.trim(),
            subtitulo: form.subtitulo.value.trim() || null,
            id_categoria: form.id_categoria.value ? parseInt(form.id_categoria.value, 10) : null,
            precio: Number(form.precio.value) || 0,
            stock: parseInt(form.stock.value, 10) || 0,
        };

        const { error } = await supabase.from('libros').insert(libro);
        if (error) return alert('Error: ' + error.message);

        alert('Libro guardado');
        form.reset();
        cargarLibros();
    });

    // Guardar categoría
    document.getElementById('form-categoria')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const nombre = form.nombre_categoria.value.trim();
        if (!nombre) return;

        const { error } = await supabase.from('categorias').insert({ nombre_categoria: nombre });
        if (error) {
            return alert(error.code === '23505' ? 'Esa categoría ya existe.' : 'Error: ' + error.message);
        }

        alert('Categoría guardado');
        form.reset();
        cargarCategorias();
    });

    // Eliminar libro (delegación de eventos)
    document.getElementById('tabla-libros')?.addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-eliminar-libro]');
        if (!btn) return;
        if (!confirm('¿Eliminar este libro?')) return;

        const { error } = await supabase.from('libros').delete().eq('id_libro', btn.dataset.eliminarLibro);
        if (error) return alert('Error: ' + error.message);
        cargarLibros();
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
    `).join('');
}

async function cargarCategorias() {
    const { data, error } = await supabase
        .from('categorias')
        .select('id_categoria, nombre_categoria')
        .order('nombre_categoria');

    if (error) {
        console.error(error);
        return;
    }

    // Select del formulario de libros
    const select = document.querySelector('#form-libro select[name="id_categoria"]');
    if (select) {
        select.innerHTML = '<option value="">Seleccionar</option>' +
            data.map(c => `<option value="${c.id_categoria}">${escapeHtml(c.nombre_categoria)}</option>`).join('');
    }

    // Tabla de categorías
    const tbody = document.getElementById('tabla-categorias');
    if (tbody) {
        tbody.innerHTML = data.map(c => `<tr><td>${escapeHtml(c.nombre_categoria)}</td></tr>`).join('');
    }
}

// ---------- Admin: Usuarios (Clientes) ----------
export async function initUsuarios() {
    const admin = await verificarAdmin();
    if (!admin) return;

    await cargarUsuarios();

    document.getElementById('tabla-usuarios')?.addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-eliminar-usuario]');
        if (!btn) return;
        if (!confirm('¿Eliminar usuario? Se borrarán también sus préstamos y favoritos.')) return;

        const { error } = await supabase.from('clientes').delete().eq('id_cliente', btn.dataset.eliminarUsuario);
        if (error) return alert('Error: ' + error.message);
        cargarUsuarios();
    });
}

async function cargarUsuarios() {
    const tbody = document.getElementById('tabla-usuarios');
    if (!tbody) return;

    const { data, error } = await supabase
        .from('clientes')
        .select('id_cliente, nombre, correo_electronico')
        .order('nombre');

    if (error) {
        console.error(error);
        tbody.innerHTML = '<tr><td colspan="4">Error al cargar usuarios.</td></tr>';
        return;
    }

    tbody.innerHTML = data.map(u => `
        <tr>
            <td>${escapeHtml(u.nombre)}</td>
            <td>${escapeHtml(u.correo_electronico)}</td>
            <td>${u.id_cliente}</td>
            <td><button type="button" data-eliminar-usuario="${u.id_cliente}">Eliminar</button></td>
        </tr>
    `).join('');
}

// ---------- Admin: Préstamos ----------
export async function initPrestamos() {
    const admin = await verificarAdmin();
    if (!admin) return;

    const tbody = document.getElementById('tabla-prestamos');
    if (!tbody) return;

    const { data, error } = await supabase
        .from('prestamos')
        .select('*, clientes(nombre), libros(titulo)')
        .order('fecha_prestamo', { ascending: false });

    if (error) {
        console.error(error);
        tbody.innerHTML = '<tr><td colspan="6">Error al cargar préstamos.</td></tr>';
        return;
    }

    tbody.innerHTML = data.map(p => `
        <tr>
            <td>${escapeHtml(p.libros?.titulo ?? '—')}</td>
            <td>${escapeHtml(p.clientes?.nombre ?? '—')}</td>
            <td>${escapeHtml(p.estado)}</td>
            <td>${formatearFecha(p.fecha_devolucion_prevista)}</td>
            <td>${p.fecha_devolucion_real ? formatearFecha(p.fecha_devolucion_real) : 'Pendiente'}</td>
            <td>
                ${p.estado === 'activo' ? 
                    `<button type="button" data-devolver="${p.id_prestamo}" class="btn-devolver">Devolver</button>` : 
                    '—'}
            </td>
        </tr>
    `).join('');

    // Delegación para botón devolver
    tbody.addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-devolver]');
        if (!btn) return;
        
        const prestamoId = btn.dataset.devolver;
        const hoy = new Date().toISOString().slice(0, 10);
        
        const { error } = await supabase
            .from('prestamos')
            .update({ 
                estado: 'devuelto',
                fecha_devolucion_real: hoy 
            })
            .eq('id_prestamo', prestamoId);
            
        if (error) return alert('Error: ' + error.message);
        initPrestamos();
    });
}

// ---------- Admin: Configuración ----------
export async function initConfig() {
    const admin = await verificarAdmin();
    if (!admin) return;

    setText('admin-nombre', admin.nombre);
    setText('admin-correo', admin.correo_electronico);

    // Actualizar perfil
    document.getElementById('form-perfil')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const nombre = e.currentTarget.nombre.value.trim();

        const { error } = await supabase
            .from('administradores')
            .update({ nombre })
            .eq('id_administrador', admin.id_administrador);

        if (error) return alert('Error: ' + error.message);
        setText('admin-nombre', nombre);
        alert('Perfil actualizado');
    });

    // Cambiar contraseña
    document.getElementById('form-password')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const nueva = form.password_nueva.value;

        if (nueva !== form.password_confirmar.value) {
            return alert('Las contraseñas no coinciden');
        }

        const { error } = await supabase.auth.updateUser({ password: nueva });
        if (error) return alert('Error: ' + error.message);

        alert('Contraseña cambiada.');
        form.reset();
    });
}


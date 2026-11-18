import { supabase } from '../api/config.js';

async function obtenerUsuario() {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data?.user) return null;
    return data.user;
}

async function obtenerIdCliente(userId) {
    const { data, error } = await supabase
        .from('clientes')
        .select('id_cliente')
        .eq('auth_user_id', userId)
        .maybeSingle();
    return error ? null : data?.id_cliente ?? null;
}

function irALogin() {
    window.location.href = '../index.html';
}

// ---------- Usuario: Inicio (catálogo) ----------
export async function initInicio() {
    if (!document.getElementById('productosContainer')) return;
    await cargarLibros();

    const btn = document.getElementById('searchBtn');
    const input = document.getElementById('searchInput');

    if (btn && input) {
        btn.addEventListener('click', () => buscarLibros(input.value.trim()));
    }
    if (input) {
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') buscarLibros(input.value.trim());
        });
    }

    document.querySelectorAll('.categoria').forEach(el => {
        el.addEventListener('click', (e) => {
            e.preventDefault();
            cargarLibros({ categoria: el.dataset.categoria });
        });
    });
}

async function cargarLibros({ categoria = null, busqueda = '' } = {}) {
    let query = supabase.from('libros').select('*, categorias(nombre_categoria)');

    if (categoria) query = query.eq('id_categoria', categoria);
    if (busqueda) query = query.ilike('titulo', `%${busqueda}%`);

    const { data, error } = await query;
    if (error) {
        console.error(error);
        return;
    }
    renderizarLibros(data);
}

function buscarLibros(texto) {
    return cargarLibros({ busqueda: texto });
}

function renderizarLibros(libros) {
    const contenedor = document.getElementById('productosContainer');
    if (!contenedor) return;

    if (!libros || libros.length === 0) {
        contenedor.innerHTML = '<p>No hay resultados.</p>';
        return;
    }

    contenedor.innerHTML = libros.map(libro => `
        <a href="ver-libro.html?id=${libro.id_libro}">
            <div class="producto">
                <img src="${escapeHtml(libro.imagen_url || '../imagenes/libro1.png')}" alt="${escapeHtml(libro.titulo)}">
                <h4>${escapeHtml(libro.titulo)}</h4>
                <p>${escapeHtml(libro.categorias?.nombre_categoria ?? 'Sin categoría')}</p>
            </div>
        </a>
    `).join('');
}

// ---------- Usuario: Favoritos ----------
export async function initFavoritos() {
    const contenedor = document.getElementById('favListaContainer');
    if (!contenedor) return;

    const user = await obtenerUsuario();
    if (!user) return irALogin();

    const idCliente = await obtenerIdCliente(user.id);
    if (!idCliente) {
        contenedor.innerHTML = '<p>No se encontró tu perfil de cliente.</p>';
        return;
    }

    const { data, error } = await supabase
        .from('favoritos')
        .select('id, libros(titulo, subtitulo, precio, categorias(nombre_categoria))')
        .eq('id_cliente', idCliente);

    if (error) {
        console.error(error);
        contenedor.innerHTML = '<p>Error al cargar favoritos.</p>';
        return;
    }

    if (!data || data.length === 0) {
        contenedor.innerHTML = '<p>No tienes favoritos.</p>';
        return;
    }

    contenedor.innerHTML = data.map(fav => `
        <div class="fav-item">
            <div class="fav-info">
                <strong>${escapeHtml(fav.libros?.titulo)}</strong>
                <span>${escapeHtml(fav.libros?.categorias?.nombre_categoria ?? 'Sin categoría')}</span>
            </div>
            <button class="fav-btn-remove" data-id="${fav.id}" type="button">
                <i class="fa-solid fa-heart-crack"></i>
            </button>
        </div>
    `).join('');

    contenedor.querySelectorAll('.fav-btn-remove').forEach(btn => {
        btn.addEventListener('click', () => quitarFavorito(btn.dataset.id));
    });
}

export async function quitarFavorito(id) {
    if (!confirm('¿Quitar de favoritos?')) return;
    const { error } = await supabase.from('favoritos').delete().eq('id', id);
    if (error) return alert('Error: ' + error.message);
    initFavoritos();
}

// Usuario: Reservas 
export async function initReservas() {
    const contenedor = document.getElementById('reservasContainer');
    if (!contenedor) return;

    const user = await obtenerUsuario();
    if (!user) return irALogin();

    const idCliente = await obtenerIdCliente(user.id);
    if (!idCliente) {
        contenedor.innerHTML = '<p>No se encontró tu perfil de cliente.</p>';
        return;
    }

    const { data, error } = await supabase
        .from('prestamos')
        .select('id_prestamo, fecha_devolucion_prevista, libros(titulo, categorias(nombre_categoria))')
        .eq('id_cliente', idCliente)
        .eq('estado', 'reservado');

    if (error) {
        console.error(error);
        contenedor.innerHTML = '<p>Error al cargar reservas.</p>';
        return;
    }

    if (!data || data.length === 0) {
        contenedor.innerHTML = '<p>No tienes reservas activas.</p>';
        return;
    }

    contenedor.innerHTML = data.map(res => `
        <div class="reservar-item">
            <div class="reservar-info">
                <strong>${escapeHtml(res.libros?.titulo)}</strong>
                <span>${escapeHtml(res.libros?.categorias?.nombre_categoria ?? 'Sin categoría')}</span>
                <span>Fecha: ${formatearFecha(res.fecha_devolucion_prevista)}</span>
            </div>
            <button class="res-btn" data-id="${res.id_prestamo}" type="button">
                <i class="fa-solid fa-bookmark"></i>
            </button>
        </div>
    `).join('');

    contenedor.querySelectorAll('.res-btn').forEach(btn => {
        btn.addEventListener('click', () => cancelarReserva(btn.dataset.id));
    });
}

export async function cancelarReserva(id) {
    if (!confirm('¿Cancelar reserva?')) return;
    const { error } = await supabase.from('prestamos').delete().eq('id_prestamo', id);
    if (error) return alert('Error: ' + error.message);
    initReservas();
}

// ---------- Usuario: Historial ----------
export async function initHistorial() {
    const contenedor = document.getElementById('historialContainer');
    if (!contenedor) return;

    const user = await obtenerUsuario();
    if (!user) return irALogin();

    document.querySelectorAll('.filtro-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.filtro-btn').forEach(b => b.classList.remove('activo'));
            btn.classList.add('activo');
            cargarHistorialPorEstado(user.id, btn.dataset.estado);
        });
    });

    // Estado por defecto
    cargarHistorialPorEstado(user.id, 'devuelto');
}

async function cargarHistorialPorEstado(userId, estado) {
    const contenedor = document.getElementById('historialContainer');
    const idCliente = await obtenerIdCliente(userId);
    
    if (!idCliente) {
        contenedor.innerHTML = '<p>No se encontró tu perfil de cliente.</p>';
        return;
    }

    let data, error;

    if (estado === 'multa') {
        // Multas -> préstamos (inner join)
        const query = supabase
            .from('multas')
            .select('id_multa, importe, estado, prestamos!inner(id_prestamo, fecha_devolucion_prevista, libros(titulo, categorias(nombre_categoria)))')
            .eq('prestamos.id_cliente', idCliente);
            
        ({ data, error } = await query);
    } else {
        const query = supabase
            .from('prestamos')
            .select('id_prestamo, estado, fecha_devolucion_prevista, fecha_devolucion_real, libros(titulo, categorias(nombre_categoria))')
            .eq('id_cliente', idCliente)
            .eq('estado', estado);
            
        ({ data, error } = await query);
    }

    if (error) {
        console.error(error);
        contenedor.innerHTML = '<p>Error al cargar el historial.</p>';
        return;
    }

    if (!data || data.length === 0) {
        contenedor.innerHTML = '<p>Sin registros.</p>';
        return;
    }

    contenedor.innerHTML = data.map(item => {
        const prestamo = estado === 'multa' ? item.prestamos : item;
        const libro = prestamo?.libros;
        const categoria = libro?.categorias?.nombre_categoria ?? '';

        let detalle = '';
        if (estado === 'multa') {
            detalle = `<span>Multa: $${item.importe} ${item.estado === 'pagada' ? '(pagada)' : '(pendiente)'}</span>`;
        } else {
            detalle = `<span>Estado: ${escapeHtml(item.estado)}</span>`;
        }

        return `
            <div class="hist-item">
                <div class="hist-info">
                    <strong>${escapeHtml(libro?.titulo ?? 'Libro')}</strong>
                    <span>${escapeHtml(categoria)}</span>
                    ${detalle}
                    <span>Devolución prevista: ${formatearFecha(prestamo?.fecha_devolucion_prevista)}</span>
                </div>
            </div>`;
    }).join('');
}

// ---------- Usuario: Configuración ----------
export async function initConfig() {
    const userName = document.getElementById('userName');
    if (!userName) return;

    const user = await obtenerUsuario();
    if (!user) return irALogin();

    setText('userName', user.email?.split('@')[0]);
    setText('userEmail', user.email);

    const btnLogout = document.getElementById('btnLogout');
    if (btnLogout) {
        btnLogout.addEventListener('click', async (e) => {
            e.preventDefault();
            await supabase.auth.signOut();
            irALogin();
        });
    }
}

// ---------- Usuario: Ver Libro / Solicitar Préstamo ----------
export async function initVerLibro() {
    if (!document.getElementById('bookTitle')) return;

    const id = new URLSearchParams(window.location.search).get('id');
    if (!id) return (window.location.href = 'inicio.html');

    const { data: libro, error } = await supabase
        .from('libros')
        .select('*, categorias(nombre_categoria)')
        .eq('id_libro', id)
        .single();

    if (error || !libro) {
        console.error(error);
        setText('bookTitle', 'Libro no encontrado');
        return;
    }

    setText('bookTitle', libro.titulo);
    setText('bookAuthor', libro.subtitulo);
    setText('bookPrice', `$${libro.precio ?? 0}`);
    setText('bookDescripcion', libro.descripcion);

    const cover = document.getElementById('bookCover');
    if (cover) cover.src = libro.imagen_url || '../imagenes/libro1.png';

    const catEl = document.getElementById('bookCategory');
    if (catEl && libro.categorias?.nombre_categoria) {
        catEl.style.display = 'block';
        const badge = catEl.querySelector('.badge-categoria');
        if (badge) badge.textContent = libro.categorias.nombre_categoria;
    }

    // Botón de préstamo
    const btnPagar = document.getElementById('btnPagar');
    if (btnPagar) {
        btnPagar.addEventListener('click', async () => {
            const user = await obtenerUsuario();
            if (!user) return alert('Inicia sesión para pedir un libro.');

            const idCliente = await obtenerIdCliente(user.id);
            if (!idCliente) return alert('No se encontró tu perfil de cliente. Contacta al administrador.');

            const devolucion = new Date();
            devolucion.setDate(devolucion.getDate() + 14); // 14 días por defecto

            const { error: errPrestamo } = await supabase.from('prestamos').insert({
                id_cliente: idCliente,
                id_libro: libro.id_libro,
                estado: 'activo',
                fecha_devolucion_prevista: devolucion.toISOString().slice(0, 10)
            });

            if (errPrestamo) return alert('Error: ' + errPrestamo.message);
            alert('¡Préstamo realizado!');
            window.location.href = 'inicio.html';
        });
    }

    // Botón de favorito
    const btnFav = document.getElementById('btnFavorito');
    if (btnFav) {
        const user = await obtenerUsuario();
        if (user) {
            const idCliente = await obtenerIdCliente(user.id);
            if (idCliente) {
                const { data: existe } = await supabase
                    .from('favoritos')
                    .select('id')
                    .eq('id_cliente', idCliente)
                    .eq('id_libro', libro.id_libro)
                    .maybeSingle();

                let favoritoId = existe?.id ?? null;
                actualizarBotonFavorito(btnFav, favoritoId !== null);

                btnFav.addEventListener('click', async () => {
                    if (favoritoId) {
                        const { error: errDel } = await supabase.from('favoritos').delete().eq('id', favoritoId);
                        if (errDel) return alert('Error: ' + errDel.message);
                        favoritoId = null;
                    } else {
                        const { data: nuevo, error: errIns } = await supabase
                            .from('favoritos')
                            .insert({ id_cliente: idCliente, id_libro: libro.id_libro })
                            .select('id')
                            .single();
                        if (errIns) return alert('Error: ' + errIns.message);
                        favoritoId = nuevo.id;
                    }
                    actualizarBotonFavorito(btnFav, favoritoId !== null);
                });
            }
        }
    }
}

function actualizarBotonFavorito(btn, activo) {
    btn.classList.toggle('active', activo);
    const icono = btn.querySelector('i');
    if (icono) icono.className = activo ? 'fa-solid fa-heart' : 'fa-regular fa-heart';
}
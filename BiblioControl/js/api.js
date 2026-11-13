import { supabase } from '../../api/config.js';

export async function obtenerClienteId() {    
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) {
        console.warn("No hay un usuario autenticado actualmente.");
        return null;
    }
    return user.id; 
}

export function formatearFecha(fecha) {
    return new Date(fecha).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// inicio.html
export async function initInicio() {
    if (!document.getElementById('productosContainer')) return;

    // Cargar libros al inicio
    await cargarLibros();

    // Configurar búsqueda
    const btn = document.getElementById('searchBtn');
    const input = document.getElementById('searchInput');
    if (btn) {
        btn.addEventListener('click', () => {
            const texto = input.value.trim();
            buscarLibros(texto);
        });
    }
    if (input) {
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const texto = input.value.trim();
                buscarLibros(texto);
            }
        });
    }

    // Configurar categorías
    document.querySelectorAll('.categoria').forEach(el => {
        el.addEventListener('click', (e) => {
            e.preventDefault();
            const cat = el.dataset.categoria;
            cargarLibrosPorCategoria(cat);
        });
    });
}

async function cargarLibros(filtro = null, busqueda = '') {
    let query = supabase.from('libros').select(`*, categorias(nombre_categoria)`);
    
    if (filtro) query = query.eq('id_categoria', filtro);
    if (busqueda) query = query.ilike('titulo', `%${busqueda}%`);

    const { data } = await query;
    renderizarLibros(data);
}

async function buscarLibros(texto) {
    await cargarLibros(null, texto);
}

async function cargarLibrosPorCategoria(cat) {
    await cargarLibros(cat);
}

function renderizarLibros(libros) {
    const contenedor = document.getElementById('productosContainer');
    if (!contenedor) return;
    
    if (libros.length === 0) {
        contenedor.innerHTML = '<p>No hay resultados.</p>';
        return;
    }

    contenedor.innerHTML = libros.map(libro => `
        <a href="ver-libro.html?id=${libro.id}">
            <div class="producto">
                <img src="${libro.imagen_url || '../imagenes/libro1.png'}">
                <h4>${libro.titulo}</h4>
                <p>${libro.categorias.nombre_categoria}</p>
            </div>
        </a>
    `).join('');
}

// favoritos.html
export async function initFavoritos() {
    if (!document.getElementById('favListaContainer')) return;

    const user = await obtenerUsuario();
    if (!user) return window.location.href = '../index.html';

    const { data } = await supabase
        .from('favoritos')
        .select(`*, libros(titulo, subtitulo, precio, categorias(nombre_categoria))`)
        .eq('id_cliente', user.id);

    const contenedor = document.getElementById('favListaContainer');
    if (!data || data.length === 0) {
        contenedor.innerHTML = '<p>No tienes favoritos.</p>';
        return;
    }

    contenedor.innerHTML = data.map(fav => `
        <div class="fav-item">
            <div class="fav-info">
                <strong>${fav.libros.titulo}</strong>
                <span>${fav.libros.categorias.nombre_categoria}</span>
            </div>
            <button class="fav-btn-remove" onclick="window.api.quitarFavorito(${fav.id})">
                <i class="fa-solid fa-heart-crack"></i>
            </button>
        </div>
    `).join('');
}

export async function quitarFavorito(id) {
    if(!confirm('¿Quitar de favoritos?')) return;
    await supabase.from('favoritos').delete().eq('id', id);
    initFavoritos(); // Recargar
}

// reservar.html
export async function initReservas() {
    if (!document.getElementById('reservasContainer')) return;

    const user = await obtenerUsuario();
    if (!user) return window.location.href = '../index.html';

    const { data } = await supabase
        .from('prestamos')
        .select(`*, libros(titulo, categorias(nombre_categoria))`)
        .eq('id_cliente', user.id)
        .eq('estado', 'reservado');

    const contenedor = document.getElementById('reservasContainer');
    if (!data || data.length === 0) {
        contenedor.innerHTML = '<p>No tienes reservas activas.</p>';
        return;
    }

    contenedor.innerHTML = data.map(res => `
        <div class="reservar-item">
            <div class="reservar-info">
                <strong>${res.libros.titulo}</strong>
                <span>${res.libros.categorias.nombre_categoria}</span>
                <span>Fecha: ${formatearFecha(res.fecha_dev_prevista)}</span>
            </div>
            <button class="res-btn" onclick="window.api.cancelarReserva(${res.id})">
                <i class="fa-solid fa-bookmark"></i>
            </button>
        </div>
    `).join('');
}

export async function cancelarReserva(id) {
    if(!confirm('¿Cancelar reserva?')) return;
    await supabase.from('prestamos').delete().eq('id', id);
    initReservas();
}

// historial.html
export async function initHistorial() {
    if (!document.getElementById('historialContainer')) return;

    const user = await obtenerUsuario();
    if (!user) return window.location.href = '../index.html';

    // Configurar filtros
    document.querySelectorAll('.filtro-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.filtro-btn').forEach(b => b.classList.remove('activo'));
            btn.classList.add('activo');
            const estado = btn.dataset.estado;
            cargarHistorialPorEstado(user.id, estado);
        });
    });

    // Cargar por defecto
    cargarHistorialPorEstado(user.id, 'devuelto');
}

async function cargarHistorialPorEstado(userId, estado) {
    let query;
    if (estado === 'multa') {
        // Ajusta según tu tabla multas
        query = supabase.from('multas').select(`*, prestamos(id, libros(titulo))`).eq('prestamos.id_cliente', userId);
    } else {
        query = supabase.from('prestamos').select(`*, libros(titulo, categorias(nombre_categoria))`).eq('id_cliente', userId).eq('estado', estado);
    }

    const { data } = await query;
    const contenedor = document.getElementById('historialContainer');
    
    if (!data || data.length === 0) {
        contenedor.innerHTML = '<p>Sin registros.</p>';
        return;
    }

    contenedor.innerHTML = data.map(item => `
        <div class="hist-item">
            <div class="hist-info">
                <strong>${item.libros?.titulo || 'Libro'}</strong>
                <span>${item.libros?.categorias?.nombre_categoria || ''}</span>
                <span>Estado: ${item.estado}</span>
            </div>
        </div>
    `).join('');
}
// config.html
export async function initConfig() {
    if (!document.getElementById('userName')) return;

    const user = await obtenerUsuario();
    if (!user) return window.location.href = '../index.html';

    document.getElementById('userName').textContent = user.email?.split('@')[0];
    document.getElementById('userEmail').textContent = user.email;

    const btnLogout = document.getElementById('btnLogout');
    if (btnLogout) {
        btnLogout.addEventListener('click', async (e) => {
            e.preventDefault();
            await supabase.auth.signOut();
            window.location.href = '../index.html';
        });
    }
}

// ver-libro.html
export async function initVerLibro() {
    if (!document.getElementById('bookTitle')) return;

    const id = new URLSearchParams(window.location.search).get('id');
    if (!id) return window.location.href = 'inicio.html';

    const { data: libro } = await supabase.from('libros').select(`*, categorias(nombre_categoria)`).eq('id', id).single();

    if (libro) {
        document.getElementById('bookTitle').textContent = libro.titulo;
        document.getElementById('bookAuthor').textContent = libro.subtitulo;
        document.getElementById('bookPrice').textContent = `$${libro.precio}`;
        document.getElementById('bookDescripcion').textContent = libro.descripcion;
        document.getElementById('bookCover').src = libro.imagen_url;
        
        // Mostrar categoría
        const catEl = document.getElementById('bookCategory');
        if (catEl && libro.categorias.nombre_categoria) {
            catEl.style.display = 'block';
            catEl.querySelector('.badge-categoria').textContent = libro.categorias.nombre_categoria;
        }
    }

    // Botón Comprar
    const btnPagar = document.getElementById('btnPagar');
    if (btnPagar) {
        btnPagar.addEventListener('click', async () => {
            const user = await obtenerUsuario();
            if(!user) return alert('Inicia sesión');
            
            await supabase.from('prestamos').insert({
                id_cliente: user.id,
                id_libro: libro.id,
                estado: 'activo'
            });
            alert('¡Compra realizada!');
        });
    }

    // Botón Favorito
    const btnFav = document.getElementById('btnFavorito');
    if (btnFav) {
        const user = await obtenerUsuario();
        if (user) {
            const { data: existe } = await supabase.from('favoritos').select('id').eq('id_cliente', user.id).eq('id_libro', libro.id).maybeSingle();
            if (existe) {
                btnFav.classList.add('active');
                btnFav.querySelector('i').className = 'fa-solid fa-heart';
            }
            
            btnFav.addEventListener('click', async () => {
                if (existe) {
                    await supabase.from('favoritos').delete().eq('id', existe.id);
                    btnFav.classList.remove('active');
                    btnFav.querySelector('i').className = 'fa-regular fa-heart';
                } else {
                    await supabase.from('favoritos').insert({ id_cliente: user.id, id_libro: libro.id });
                    btnFav.classList.add('active');
                    btnFav.querySelector('i').className = 'fa-solid fa-heart';
                }
            });
        }
    }
}
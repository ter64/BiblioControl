import { supabase } from '../../api/config.js';

async function obtenerUsuario() {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return null;
    return user; 
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
import { supabase } from '../api/config.js';

export async function verificarAdmin() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return window.location.href = '../../index.html';

    const { data: admin, error } = await supabase
        .from('administradores')
        .select('*')
        .eq('correo', user.email)
        .maybeSingle();

    if (error || !admin) {
        alert('Acceso denegado.');
        window.location.href = '../../index.html';
        return null;
    }
    return admin;
}

// inicio-admin.html
export async function initInicio() {
    const admin = await verificarAdmin();
    if (!admin) return;

    // Cards
    const { count: totalLibros } = await supabase.from('libros').select('*', { count: 'exact', head: true });
    const { count: prestados } = await supabase.from('prestamos').select('*', { count: 'exact', head: true }).eq('estado', 'activo');
    const { count: usuarios } = await supabase.from('clientes').select('*', { count: 'exact', head: true });
    const { count: atrasados } = await supabase.from('prestamos').select('*', { count: 'exact', head: true }).eq('estado', 'vencido');

    document.getElementById('total-libros').textContent = totalLibros || 0;
    document.getElementById('libros-prestados').textContent = prestados || 0;
    document.getElementById('usuarios-registrados').textContent = usuarios || 0;
    document.getElementById('devoluciones-atrasadas').textContent = atrasados || 0;

    // Tabla Estados
    const tbodyEstados = document.getElementById('tabla-estados');
    ['activo', 'devuelto', 'vencido', 'reservado'].forEach(async (estado) => {
        const { count } = await supabase.from('prestamos').select('*', { count: 'exact', head: true }).eq('estado', estado);
        tbodyEstados.innerHTML += `<tr><td>${estado}</td><td>${count}</td></tr>`;
    });

    // Actividad Reciente
    const { data: actividad } = await supabase
        .from('prestamos')
        .select('fecha_prestamo, estado, clientes(nombre), libros(titulo)')
        .order('fecha_prestamo', { ascending: false })
        .limit(5);
    
    const lista = document.getElementById('lista-actividad');
    if (actividad) {
        lista.innerHTML = actividad.map(a => `
            <li><strong>${a.libros.titulo}</strong> - ${a.estado} (${a.clientes.nombre})</li>
        `).join('');
    }
}

// libros.html
export async function initLibros() {
    const admin = await verificarAdmin();
    if (!admin) return;

    await cargarLibros();
    await cargarCategorias();

    // Guardar Libro
    document.querySelector('form[action="libro_guardar.php"]').addEventListener('submit', async (e) => {
        e.preventDefault();
        const form = e.target;
        const libro = {
            titulo: form.titulo.value,
            subtitulo: form.subtitulo.value,
            id_categoria: form.id_categoria.value,
            precio: form.precio.value,
            stock: form.stock.value
        };
        const { error } = await supabase.from('libros').insert(libro);
        if (error) alert('Error: ' + error.message);
        else {
            alert('Libro guardado');
            form.reset();
            cargarLibros();
        }
    });

    // Guardar Categoría
    document.querySelector('form[action="categoria_guardar.php"]').addEventListener('submit', async (e) => {
        e.preventDefault();
        const { error } = await supabase.from('categorias').insert({ nombre_categoria: e.target.nombre_categoria.value });
        if (error) alert('Error');
        else {
            alert('Categoría guardada');
            e.target.reset();
            cargarCategorias();
        }
    });
}

async function cargarLibros() {
    const { data } = await supabase.from('libros').select(`*, categorias(nombre_categoria)`);
    const tbody = document.getElementById('tabla-libros');
    tbody.innerHTML = data.map(l => `
        <tr>
            <td>${l.id}</td><td>${l.titulo}</td><td>${l.subtitulo}</td>
            <td>${l.categorias.nombre_categoria}</td><td>${l.precio}</td><td>${l.stock}</td>
            <td><button onclick="eliminarLibro(${l.id})">Eliminar</button></td>
        </tr>
    `).join('');
}

async function cargarCategorias() {
    const { data } = await supabase.from('categorias').select('id, nombre_categoria');
    // Llenar Select
    const select = document.querySelector('select[name="id_categoria"]');
    select.innerHTML = '<option value="">Seleccionar</option>' + data.map(c => `<option value="${c.id}">${c.nombre_categoria}</option>`).join('');
    // Llenar Tabla
    const tbody = document.getElementById('tabla-categorias');
    tbody.innerHTML = data.map(c => `<tr><td>${c.nombre_categoria}</td></tr>`).join('');
}

window.eliminarLibro = async (id) => {
    if (confirm('¿Eliminar?')) {
        await supabase.from('libros').delete().eq('id', id);
        cargarLibros();
    }
};

// usuarios.html
export async function initUsuarios() {
    const admin = await verificarAdmin();
    if (!admin) return;

    const { data } = await supabase.from('clientes').select('*');
    const tbody = document.getElementById('tabla-usuarios');
    tbody.innerHTML = data.map(u => `
        <tr>
            <td>${u.nombre}</td><td>${u.correo}</td><td>${u.id}</td>
            <td><button onclick="eliminarUsuario('${u.id}')">Eliminar</button></td>
        </tr>
    `).join('');
}

window.eliminarUsuario = async (id) => {
    if (confirm('¿Eliminar usuario?')) {
        await supabase.from('clientes').delete().eq('id', id);
        initUsuarios();
    }
};

// prestamos.html
export async function initPrestamos() {
    const admin = await verificarAdmin();
    if (!admin) return;

    const { data } = await supabase
        .from('prestamos')
        .select(`*, clientes(nombre), libros(titulo)`);
    
    const tbody = document.getElementById('tabla-prestamos');
    tbody.innerHTML = data.map(p => `
        <tr>
            <td>${p.libros.titulo}</td><td>${p.clientes.nombre}</td>
            <td>${p.estado}</td><td>${p.fecha_dev_prevista}</td>
            <td>${p.fecha_dev_real || 'Pendiente'}</td>
        </tr>
    `).join('');
}

// configuracion.html
export async function initConfig() {
    const admin = await verificarAdmin();
    if (!admin) return;

    document.getElementById('admin-nombre').textContent = admin.nombre;
    document.getElementById('admin-correo').textContent = admin.correo;

    // Actualizar Perfil
    document.querySelector('form[action="perfil_actualizar.php"]').addEventListener('submit', async (e) => {
        e.preventDefault();
        const { error } = await supabase.from('administradores').update({ nombre: e.target.nombre.value }).eq('id', admin.id);
        if (!error) alert('Perfil actualizado');
    });

    // Cambiar Contraseña
    document.querySelector('form[action="password_cambiar.php"]').addEventListener('submit', async (e) => {
        e.preventDefault();
        if (e.target.password_nueva.value !== e.target.password_confirmar.value) {
            return alert('Las contraseñas no coinciden');
        }
        const { error } = await supabase.auth.updateUser({ password: e.target.password_nueva.value });
        if (error) alert('Error: ' + error.message);
        else alert('Contraseña cambiada. Inicia sesión de nuevo.');
    });
}
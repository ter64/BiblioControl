import { supabase } from '../api/config.js';

const CONTRASENA_AUTH = 'gestionada-por-supabase-auth';

function traducirError(error) {
    const msg = error?.message ?? '';
    if (/invalid login credentials/i.test(msg)) return 'Correo o contraseña incorrectos.';
    if (/email not confirmed/i.test(msg)) return 'Todavía no confirmaste tu correo. Revisá tu bandeja de entrada.';
    if (/already registered/i.test(msg)) return 'Ese correo ya está registrado. Iniciá sesión.';
    if (/password should be at least/i.test(msg)) return 'La contraseña es muy corta (mínimo 6 caracteres).';
    return msg;
}
async function asegurarPerfilCliente(user, nombre) {
    const { error: errRpc } = await supabase.rpc('asegurar_perfil_cliente', {
        p_nombre: nombre ?? user.user_metadata?.nombre ?? null
    });
    if (!errRpc) return;
    console.warn('asegurar_perfil_cliente no disponible:', errRpc.message);

    const { data: existente, error: errBuscar } = await supabase
        .from('clientes')
        .select('id_cliente')
        .eq('auth_user_id', user.id)
        .maybeSingle();

    if (errBuscar) { console.warn('Error buscando perfil:', errBuscar.message); return; }
    if (existente) return;

    const { error } = await supabase.from('clientes').insert({
        auth_user_id: user.id,
        nombre: nombre || user.user_metadata?.nombre || user.email.split('@')[0],
        correo_electronico: user.email.toLowerCase(),
        contraseña: CONTRASENA_AUTH
    });
    if (error) console.warn('No se pudo crear el perfil de cliente:', error.message);
}

async function esAdministrador(email) {
    const { data, error } = await supabase.rpc('es_admin');
    if (!error) return data === true;

    console.warn('es_admin() no disponible:', error.message);
    const { data: fila } = await supabase
        .from('administradores')
        .select('id_administrador')
        .ilike('correo_electronico', email.replace(/[\\%_]/g, '\\$&'))
        .maybeSingle();
    return !!fila;
}

document.addEventListener('DOMContentLoaded', () => {

    // --- ANIMACIÓN ---
    const container = document.querySelector('.container');
    const btnSignIn = document.getElementById('btn-sign-in');
    const btnSignUp = document.getElementById('btn-sign-up');

    if (btnSignIn && btnSignUp && container) {
        btnSignIn.addEventListener('click', () => container.classList.remove('toggle'));
        btnSignUp.addEventListener('click', () => container.classList.add('toggle'));
    }

    // --- REGISTRO ---
    const formSignUp = document.getElementById('form-sign-up');
    if (formSignUp) {
        formSignUp.addEventListener('submit', async (e) => {
            e.preventDefault();
            const nombre = document.getElementById('reg-nombre').value.trim();
            const email = document.getElementById('reg-email').value.trim().toLowerCase();
            const password = document.getElementById('reg-password').value;

            if (!nombre || !email || !password) return alert('Completa todos los campos.');
            if (password.length < 6) return alert('La contraseña debe tener al menos 6 caracteres.');

            const boton = formSignUp.querySelector('button[type="submit"]');
            if (boton) boton.disabled = true;

            try {
                const { data: authData, error: authError } = await supabase.auth.signUp({
                    email,
                    password,
                    options: { data: { nombre } }
                });
                if (authError) throw authError;

                // con "confirmar email" activado, un correo repetido no da error: llega sin identidades
                if (!authData.user || authData.user.identities?.length === 0) {
                    throw new Error('Ese correo ya está registrado. Iniciá sesión.');
                }

                let mensaje;
                if (authData.session) {
                    // confirmación de correo desactivada: ya hay sesión, creamos el perfil
                    await asegurarPerfilCliente(authData.user, nombre);
                    await supabase.auth.signOut();
                    mensaje = 'Registro exitoso. Iniciá sesión.';
                } else {
                    // confirmación activada: el perfil se crea en el primer ingreso
                    mensaje = 'Registro exitoso. Revisá tu correo para confirmar la cuenta y después iniciá sesión.';
                }

                alert(mensaje);
                formSignUp.reset();

                // pasa al panel de inicio de sesión con el correo ya cargado
                const loginEmail = document.getElementById('login-email');
                if (loginEmail) loginEmail.value = email;
                if (container) container.classList.remove('toggle');
                document.getElementById('login-password')?.focus();
            } catch (error) {
                console.error('FALLO REGISTRO:', error);
                alert('Error: ' + traducirError(error));
            } finally {
                if (boton) boton.disabled = false;
            }
        });
    }

    // --- LOGIN ---
    const formLogin = document.getElementById('form-login');
    if (formLogin) {
        formLogin.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('login-email').value.trim().toLowerCase();
            const password = document.getElementById('login-password').value;

            const boton = formLogin.querySelector('button[type="submit"]');
            if (boton) boton.disabled = true;

            try {
                const { data, error } = await supabase.auth.signInWithPassword({ email, password });
                if (error) throw error;

                if (await esAdministrador(email)) {
                    window.location.href = './administrador/inicio-admin.html';
                } else {
                    await asegurarPerfilCliente(data.user);
                    window.location.href = './usuario/inicio.html';
                }
            } catch (error) {
                console.error('FALLO LOGIN:', error);
                alert('No se pudo iniciar sesión: ' + traducirError(error));
                if (boton) boton.disabled = false;
            }
        });
    }
});
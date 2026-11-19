import { supabase } from '../api/config.js';

// Se leen al cargar el módulo: supabase-js borra el "#..." de la URL apenas lo procesa
const hashInicial = new URLSearchParams(window.location.hash.substring(1));
const enlaceConError = hashInicial.get('error_description');

document.addEventListener('DOMContentLoaded', async () => {
    const paso1 = document.getElementById('paso1');
    const paso2 = document.getElementById('paso2');
    const paso3 = document.getElementById('paso3');
    const btnAccion = document.getElementById('btnAccion');
    const mensajeEstado = document.getElementById('mensajeEstado');

    let { data } = await supabase.auth.getSession();

    if (!data?.session && hashInicial.get('type') === 'recovery') {
        const token = hashInicial.get('access_token');
        if (token) {
            const { error: errSet } = await supabase.auth.setSession({
                access_token: token,
                refresh_token: hashInicial.get('refresh_token')
            });
            if (!errSet) ({ data } = await supabase.auth.getSession());
        }
    }

    if (data?.session) {
        paso1.style.display = 'none';
        paso2.style.display = 'block';
        paso3.style.display = 'block';
        btnAccion.textContent = 'Guardar Nueva Contraseña';

        btnAccion.onclick = async () => {
            const pass1 = document.getElementById('nuevaPassword').value;
            const pass2 = document.getElementById('confirmarPassword').value;

            if (pass1 !== pass2) return alert('Las contraseñas no coinciden');
            if (pass1.length < 6) return alert('Mínimo 6 caracteres');

            btnAccion.disabled = true;
            const { error } = await supabase.auth.updateUser({ password: pass1 });

            if (error) {
                btnAccion.disabled = false;
                return alert('Error: ' + error.message);
            }

            alert('Contraseña actualizada correctamente.');
            await supabase.auth.signOut();
            window.location.href = 'index.html';
        };
    } else {
        if (enlaceConError) {
            mensajeEstado.textContent = 'El enlace venció o no es válido. Pedí uno nuevo.';
        }

        btnAccion.onclick = async () => {
            const email = document.getElementById('emailInput').value.trim();
            if (!email) return alert('Ingrese su correo');

            btnAccion.disabled = true;
            const { error } = await supabase.auth.resetPasswordForEmail(email, {
                redirectTo: `${window.location.origin}/recuperar-password.html`
            });

            if (error) {
                btnAccion.disabled = false;
                alert('Error al enviar correo: ' + error.message);
            } else {
                mensajeEstado.textContent = 'Correo enviado. Revisa tu bandeja de entrada.';
                paso1.style.display = 'none';
                btnAccion.style.display = 'none';
            }
        };
    }
});
import { supabase } from '/api/config.js';

document.addEventListener('DOMContentLoaded', async () => {
    const paso1 = document.getElementById('paso1');
    const paso2 = document.getElementById('paso2');
    const paso3 = document.getElementById('paso3');
    const btnAccion = document.getElementById('btnAccion');
    const mensajeEstado = document.getElementById('mensajeEstado');

    let { data } = await supabase.auth.getSession();

    if (!data?.session && window.location.hash.includes('type=recovery')) {
        const params = new URLSearchParams(window.location.hash.substring(1));
        const token = params.get('access_token');
        if (token) {
            const { error: errSet } = await supabase.auth.setSession({
                access_token: token,
                refresh_token: params.get('refresh_token')
            });
            if (!errSet) {
                ({ data } = await supabase.auth.getSession());
            }
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

            try {
                const { error } = await supabase.auth.updateUser({ password: pass1 });
                if (error) throw error;

                await supabase.rpc('actualizar_password_seguro', { p_nueva: pass1 });

                alert('Contraseña actualizada correctamente.');
                await supabase.auth.signOut();
                window.location.href = 'index.html';
            } catch (error) {
                alert('Error: ' + error.message);
            }
        };
    } else {
        btnAccion.onclick = async () => {
            const email = document.getElementById('emailInput').value.trim();
            if (!email) return alert('Ingrese su correo');

            const { error } = await supabase.auth.resetPasswordForEmail(email, {
                redirectTo: `${window.location.origin}/recuperar-password.html`
            });

            if (error) {
                alert('Error al enviar correo: ' + error.message);
            } else {
                mensajeEstado.textContent = 'Correo enviado. Revisa tu bandeja de entrada.';
                paso1.style.display = 'none';
                btnAccion.style.display = 'none';
            }
        };
    }
});
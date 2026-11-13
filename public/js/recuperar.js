import { supabase } from '../../api/config.js';

document.addEventListener('DOMContentLoaded', async () => {
    const paso1 = document.getElementById('paso1');
    const paso2 = document.getElementById('paso2');
    const paso3 = document.getElementById('paso3');
    const btnAccion = document.getElementById('btnAccion');
    const mensajeEstado = document.getElementById('mensajeEstado');

    const { data } = await supabase.auth.getSession();

    if (data?.session) {
        // Usuario hizo clic en el enlace del correo
        paso1.style.display = 'none';
        paso2.style.display = 'block';
        paso3.style.display = 'block';
        btnAccion.textContent = 'Guardar Nueva Contraseña';

        btnAccion.onclick = async () => {
            const pass1 = document.getElementById('nuevaPassword').value;
            const pass2 = document.getElementById('confirmarPassword').value;

            if (pass1 !== pass2) return alert('Las contraseñas no coinciden');
            if (pass1.length < 6) return alert('Mínimo 6 caracteres');

            const { error } = await supabase.auth.updateUser({ password: pass1 });
            if (error) alert('Error: ' + error.message);
            else {
                alert('Contraseña actualizada');
                window.location.href = 'index.html';
            }
        };
    } else {
        // Usuario está en la página principal de recuperación
        btnAccion.onclick = async () => {
            const email = document.getElementById('emailInput').value;
            if (!email) return alert('Ingrese su correo');

            const { error } = await supabase.auth.resetPasswordForEmail(email, {
                redirectTo: window.location.href
            });

            if (error) alert('Error al enviar correo');
            else {
                mensajeEstado.textContent = 'Correo enviado. Revise su bandeja.';
                paso1.style.display = 'none';
                btnAccion.style.display = 'none';
            }
        };
    }
});
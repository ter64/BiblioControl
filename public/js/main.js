import { supabase } from '../api/config.js';

document.addEventListener('DOMContentLoaded', () => {

    // --- ANIMACIÓN ---
    const container = document.querySelector(".container");
    const btnSignIn = document.getElementById("btn-sign-in");
    const btnSignUp = document.getElementById("btn-sign-up");

    if (btnSignIn && btnSignUp && container) {
        btnSignIn.addEventListener("click", () => container.classList.remove("toggle"));
        btnSignUp.addEventListener("click", () => container.classList.add("toggle"));
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

            try {
                const { data: authData, error: authError } = await supabase.auth.signUp({ email, password });
                if (authError) throw authError;

                const { error: insertError } = await supabase.from('clientes').insert({
                    nombre,
                    correo_electronico: email,
                    auth_user_id: authData.user.id
                });
                if (insertError) throw insertError;

                alert('Registro exitoso. Inicia sesión.');
                btnSignIn.click();
            } catch (error) {
                console.error('FALLO REGISTRO:', error);
                alert('Error: ' + error.message);
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

            try {
                const { data, error } = await supabase.auth.signInWithPassword({ email, password });
                if (error) throw error;

                const { data: adminData, error: errAdmin } = await supabase
                    .from('administradores')
                    .select('id_administrador, nombre, correo_electronico')
                    .eq('correo_electronico', email)
                    .maybeSingle();

                if (errAdmin) console.warn('Error consultando admins:', errAdmin.message);

                if (adminData) {
                    window.location.href = './administrador/inicio-admin.html';
                } else {
                    window.location.href = './usuario/inicio.html';
                }
            } catch (error) {
                console.error('FALLO LOGIN:', error);
                alert('No se pudo iniciar sesión: ' + error.message);
            }
        });
    }
});
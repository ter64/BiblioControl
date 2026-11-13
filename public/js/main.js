import { supabase } from '../../api/config.js';
    const container = document.querySelector(".container");
    const btnSignIn = document.getElementById("btn-sign-in");
    const btnSignUp = document.getElementById("btn-sign-up");

    if (btnSignIn && btnSignUp) {
        btnSignIn.addEventListener("click", () => container.classList.remove("toggle"));
        btnSignUp.addEventListener("click", () => container.classList.add("toggle"));
    }

    // --- REGISTRO ---
    const formSignUp = document.getElementById('form-sign-up');
    if (formSignUp) {
        formSignUp.addEventListener('submit', async (e) => {
            e.preventDefault();
            const nombre = document.getElementById('reg-nombre').value;
            const email = document.getElementById('reg-email').value;
            const password = document.getElementById('reg-password').value;

            try {
                const { data: authData, error: authError } = await supabase.auth.signUp({
                    email, password
                });
                if (authError) throw authError;

                await supabase.from('clientes').insert({
                    nombre,
                    correo: email,
                    id_usuario: authData.user.id,
                    contraseña: password
                });

                alert('Registro exitoso. Inicia sesión.');
                btnSignIn.click(); // Volver al login
            } catch (error) {
                alert('Error: ' + error.message);
            }
        });
    }

    // --- LOGIN ---
    const formLogin = document.getElementById('form-login');
    if (formLogin) {
        formLogin.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('login-email').value;
            const password = document.getElementById('login-password').value;

            try {
                const { data, error } = await supabase.auth.signInWithPassword({ email, password });
                if (error) throw error;

                // Verificar si es Admin
                const { data: adminData } = await supabase.from('administradores').select('*').eq('correo', email).single();

                if (adminData) {
                    alert('Admin: ' + adminData.nombre);
                    window.location.href = "administrador/inicio-admin.html";
                } else {
                    alert('Bienvenido: ' + email);
                    window.location.href = "usuario/inicio.html";
                }
            } catch (error) {
                alert('Credenciales incorrectas.');
            }
        });
    };
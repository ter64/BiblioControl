# BiblioControl

Sistema web diseñado para facilitar y optimizar la gestión integral de una biblioteca, centralizando la información de libros y usuarios en un solo lugar. Permite realizar búsquedas en línea, gestionar préstamos y devoluciones, controlar el stock de ejemplares y realizar reservas de manera ágil y segura.

* **Institución:** Centro Educativo Nonogasta (C.E.N.)
* **Integrantes:** Terrazas Esther, Ramirez Edit, Horca Anahi
* **Curso y division:** 5° 2°

## Funcionalidades Principales

* **Control de Acceso por Roles**
(**Administrador** o **Cliente / Lector**).

* **Catálogo y Búsqueda en Línea**

* **Gestión de Préstamos y Reservas**

* **Lista de Favoritos**

* **Panel de Administración** 


##  Arquitectura del Proyecto

```text
BiblioControl/
├── public/
│   ├── administrador/       # Vistas del panel de administración
│   ├── usuario/             # Vistas del lector
│   ├── css/                 # Hojas de estilo
│   ├── imagenes/            # Recursos gráficos y portadas de libros
│   ├── api/            
│   │   └── config.js        # Inicialización del cliente Supabase
│   ├── bd/            
│   │   └── supabase.sql     # Codigo para ejecutar en Supabase SQL
│   ├── js/
│   │   ├── api-admin.js     # Consultas y lógica de comunicación con Supabase
│   │   ├── api-usuario.js
│   │   ├── recuperar.js
│   │   └── main.js          # Manejo del DOM, eventos y animaciones de interfaz
│   └── index.html           # Pantalla principal de Inicio de Sesión y Registro
├── .env                     # Variables para autenticación
├── .gitignore               # Archivos excluidos del repositorio
└── README.md                # Documentación del proyecto

```

## Diagrama

![DIAGRAMA] (/public/imagenes/diagramaa.jpeg)

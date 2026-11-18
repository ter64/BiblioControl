-- BiblioControl
-- Ejecutar en Supabase SQL Editor

create table categorias (
  id_categoria      int generated always as identity primary key,
  nombre_categoria  varchar(50) not null unique
);

create table clientes (
  id_cliente          int generated always as identity primary key,
  auth_user_id        uuid unique references auth.users(id) on delete set null, -- enlace con Supabase Auth
  nombre              varchar(100) not null,
  correo_electronico  varchar(100) not null unique,
  contraseña          varchar(255) not null
);

create table administradores (
  id_administrador    int generated always as identity primary key,
  auth_user_id        uuid unique references auth.users(id) on delete set null, -- enlace con Supabase Auth
  nombre              varchar(100) not null,
  correo_electronico  varchar(100) not null unique,
  contraseña          varchar(255) not null
);
--agregar admin principal
insert into administradores (nombre, correo_electronico, contraseña)
values (
    'Administrador Principal',
    'admin@gmail.com',
    'mango4'
);

create table libros (
  id_libro      int generated always as identity primary key,
  titulo        varchar(150) not null,
  subtitulo     varchar(150),
  id_categoria  int not null references categorias(id_categoria) on delete restrict,
  precio        decimal(10,5) check (precio > 0),
  stock         int not null check (stock >= 0)
);

create table prestamos (
  id_prestamo                 int generated always as identity primary key,
  id_cliente                  int not null references clientes(id_cliente) on delete cascade,
  id_administrador            int not null references administradores(id_administrador) on delete restrict,
  id_libro                    int not null references libros(id_libro) on delete restrict,
  fecha_prestamo              date not null default current_date,
  fecha_devolucion_prevista   date not null,
  fecha_devolucion_real       date,
  estado                      varchar(30) not null
    check (estado in ('reservado', 'activo', 'vencido', 'devuelto')),
  constraint prevista_valida check (fecha_devolucion_prevista >= fecha_prestamo),
  constraint real_valida check (fecha_devolucion_real is null or fecha_devolucion_real >= fecha_prestamo)
);

create table multas (
  id_multa      int generated always as identity primary key,
  id_prestamo   int not null unique references prestamos(id_prestamo) on delete cascade,
  fecha_multa   date not null default current_date,
  importe       decimal(10,2) not null check (importe >= 0),
  estado        varchar(30) not null check (estado in ('pendiente', 'pagada'))
);

create table favoritos (
  id bigint generated always as identity primary key,
  id_cliente int not null references clientes(id_cliente) on delete cascade,
  id_libro int not null references libros(id_libro) on delete cascade,
  unique (id_cliente, id_libro)
);

create table reservas (
  id_reserva        int generated always as identity primary key,
  id_cliente        int not null references clientes(id_cliente) on delete cascade,
  id_libro          int not null references libros(id_libro) on delete restrict,
  fecha_reserva     date not null default current_date,
  fecha_limite      date not null, -- plazo para recoger el libro
  estado            varchar(30) not null check (estado in ('pendiente', 'confirmado', 'expirado', 'cancelado')),
  unique (id_cliente, id_libro)
);

-- Indices para consultas frecuentes
create index idx_prestamos_cliente on prestamos(id_cliente);
create index idx_prestamos_libro on prestamos(id_libro);
create index idx_prestamos_estado on prestamos(estado);
create index idx_libros_categoria on libros(id_categoria);
create index idx_multas_prestamo on multas(id_prestamo);
create index idx_favoritos_cliente on favoritos(id_cliente);
create index idx_reservas_cliente on reservas(id_cliente);
create index idx_reservas_libro on reservas(id_libro);
create index idx_reservas_estado on reservas(estado);

-- Función que detecta préstamos vencidos y crea la multa
create or replace function generar_multa_automatica()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_prestamo prestamos%rowtype;
  v_dias_vencimiento int;
  v_importe decimal(10,2);
begin
  -- Solo actuar cuando el estado cambia a 'vencido'
  if new.estado = 'vencido' and old.estado != 'vencido' then
    -- Verificar si ya existe multa para este préstamo
    if not exists (select 1 from multas where id_prestamo = new.id_prestamo) then
      -- Calcular días de vencimiento
      v_dias_vencimiento := current_date - new.fecha_devolucion_prevista;
      
      -- Calcular importe: $0.50 por día de atraso (ajustable)
      v_importe := v_dias_vencimiento * 0.50;
      
      -- Crear la multa automáticamente
      insert into multas (id_prestamo, fecha_multa, importe, estado)
      values (new.id_prestamo, current_date, v_importe, 'pendiente');
    end if;
  end if;
  
  return new;
end;
$$;

create trigger trigger_generar_multa
after update on prestamos
for each row
execute function generar_multa_automatica();

-- verificaar admin
create or replace function es_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from administradores
    where lower(correo_electronico) = lower(auth.jwt() ->> 'email')
  );
$$;

-- no repetir id_cliente
create or replace function es_mi_cliente(p_id_cliente int)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from clientes
    where id_cliente = p_id_cliente and auth_user_id = auth.uid()
  );
$$;


-- permisos

alter table categorias enable row level security;
create policy "categorias lectura" on categorias for select using (true);
create policy "categorias admin" on categorias for all using (es_admin()) with check (es_admin());


alter table libros enable row level security;
create policy "libros lectura" on libros for select using (true);
create policy "libros admin" on libros for all using (es_admin()) with check (es_admin());

alter table clientes enable row level security;
create policy "clientes ver propio" on clientes for select
  using (auth_user_id = auth.uid() or es_admin());
create policy "clientes registrarse" on clientes for insert
  with check (auth_user_id = auth.uid() or es_admin());
create policy "clientes editar propio" on clientes for update
  using (auth_user_id = auth.uid() or es_admin())
  with check (auth_user_id = auth.uid() or es_admin());
create policy "clientes admin borrar" on clientes for delete using (es_admin());

alter table administradores enable row level security;
create policy "admins ver" on administradores for select using (es_admin());
create policy "admins gestionar" on administradores for all
  using (es_admin()) with check (es_admin());

alter table prestamos enable row level security;
create policy "prestamos ver" on prestamos for select
  using (es_mi_cliente(id_cliente) or es_admin());
create policy "prestamos admin" on prestamos for all
  using (es_admin()) with check (es_admin());


alter table multas enable row level security;
create policy "multas ver" on multas for select
  using (
    es_admin() or exists (
      select 1 from prestamos p
      where p.id_prestamo = multas.id_prestamo
        and es_mi_cliente(p.id_cliente)
    )
  );
create policy "multas admin" on multas for all
  using (es_admin()) with check (es_admin());



alter table favoritos enable row level security;
create policy "favoritos ver" on favoritos for select
  using (es_admin() or exists (
    select 1 from clientes c where c.id_cliente = favoritos.id_cliente and c.auth_user_id = auth.uid()
  ));
create policy "favoritos insertar" on favoritos for insert
  with check (exists (
    select 1 from clientes c where c.id_cliente = favoritos.id_cliente and c.auth_user_id = auth.uid()
  ));
create policy "favoritos borrar" on favoritos for delete
  using (exists (
    select 1 from clientes c where c.id_cliente = favoritos.id_cliente and c.auth_user_id = auth.uid()
  ));


alter table reservas enable row level security;
create policy "reservas ver" on reservas for select
  using (es_admin() or exists (
    select 1 from clientes c where c.id_cliente = reservas.id_cliente and c.auth_user_id = auth.uid()
  ));
create policy "reservas insertar" on reservas for insert
  with check (exists (
    select 1 from clientes c where c.id_cliente = reservas.id_cliente and c.auth_user_id = auth.uid()
  ));
create policy "reservas actualizar" on reservas for update
  using (
    es_admin() or exists (
      select 1 from clientes c where c.id_cliente = reservas.id_cliente and c.auth_user_id = auth.uid()
    )
  );
create policy "reservas borrar" on reservas for delete
  using (
    es_admin() or exists (
      select 1 from clientes c where c.id_cliente = reservas.id_cliente and c.auth_user_id = auth.uid()
    )
  );
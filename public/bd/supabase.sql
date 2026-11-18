--TABLAS
create table configuracion (
  id                  int primary key default 1 check (id = 1),
  dias_prestamo       int           not null default 14   check (dias_prestamo > 0),
  max_libros_cliente  int           not null default 3    check (max_libros_cliente > 0),
  multa_diaria        decimal(10,2) not null default 0.50 check (multa_diaria >= 0)
);
insert into configuracion default values;

create table categorias (
  id_categoria      int generated always as identity primary key,
  nombre_categoria  varchar(50) not null unique
);

create table clientes (
  id_cliente          int generated always as identity primary key,
  auth_user_id        uuid unique references auth.users(id) on delete set null,
  nombre              varchar(100) not null,
  correo_electronico  varchar(100) not null unique,
  contraseña          varchar(255) not null
);

create table administradores (
  id_administrador    int generated always as identity primary key,
  auth_user_id        uuid unique references auth.users(id) on delete set null,
  nombre              varchar(100) not null,
  correo_electronico  varchar(100) not null unique,
  contraseña          varchar(255) not null
);


insert into administradores (nombre, correo_electronico, contraseña)
values ('Administrador Principal', 'admin@biblioteca.com', '123456')
on conflict (correo_electronico) do nothing;

create table libros (
  id_libro      int generated always as identity primary key,
  titulo        varchar(150) not null,
  subtitulo     varchar(150), 
  descripcion   text,
  imagen_url    text,
  id_categoria  int not null references categorias(id_categoria) on delete restrict,
  precio        decimal(10,5) check (precio > 0),
  stock         int not null check (stock >= 0)
);

create table prestamos (
  id_prestamo                 int generated always as identity primary key,
  id_cliente                  int not null references clientes(id_cliente) on delete cascade,
  id_administrador            int references administradores(id_administrador) on delete set null,
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
  id          bigint generated always as identity primary key,
  id_cliente  int not null references clientes(id_cliente) on delete cascade,
  id_libro    int not null references libros(id_libro) on delete cascade,
  unique (id_cliente, id_libro)
);

create table reservas (
  id_reserva     int generated always as identity primary key,
  id_cliente     int not null references clientes(id_cliente) on delete cascade,
  id_libro       int not null references libros(id_libro) on delete restrict,
  fecha_reserva  date not null default current_date,
  fecha_limite   date not null,
  estado         varchar(30) not null check (estado in ('pendiente', 'confirmado', 'expirado', 'cancelado')),
  unique (id_cliente, id_libro)
);

create table notificaciones (
  id          bigint generated always as identity primary key,
  id_cliente  int not null references clientes(id_cliente) on delete cascade,
  id_libro    int references libros(id_libro) on delete cascade,
  mensaje     text not null,
  tipo        varchar(30) not null default 'info'
    check (tipo in ('disponible', 'vencimiento', 'multa', 'reserva', 'info')),
  leida       boolean not null default false,
  creada_en   timestamptz not null default now()
);

-- Índices
create index idx_prestamos_cliente       on prestamos(id_cliente);
create index idx_prestamos_libro         on prestamos(id_libro);
create index idx_prestamos_estado        on prestamos(estado);
create index idx_libros_categoria        on libros(id_categoria);
create index idx_multas_prestamo         on multas(id_prestamo);
create index idx_favoritos_cliente       on favoritos(id_cliente);
create index idx_reservas_cliente        on reservas(id_cliente);
create index idx_reservas_libro          on reservas(id_libro);
create index idx_reservas_estado         on reservas(estado);
create index idx_notificaciones_cliente  on notificaciones(id_cliente, leida);


create or replace function es_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from administradores
    where lower(correo_electronico) = lower(auth.jwt() ->> 'email')
  );
$$;

create or replace function es_mi_cliente(p_id_cliente int)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from clientes
    where id_cliente = p_id_cliente and auth_user_id = auth.uid()
  );
$$;

-- Calcula fecha prevista, valida máximo de libros y descuenta stock
create or replace function validar_prestamo_nuevo()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_dias int;
  v_max int;
  v_activos int;
begin
  select dias_prestamo, max_libros_cliente into v_dias, v_max
  from configuracion where id = 1;

  if new.fecha_devolucion_prevista is null then
    new.fecha_devolucion_prevista := new.fecha_prestamo + v_dias;
  end if;

  if new.estado = 'activo' then
    select count(*) into v_activos
    from prestamos
    where id_cliente = new.id_cliente and estado in ('activo', 'vencido');

    if v_activos >= v_max then
      raise exception 'Alcanzaste el máximo de % libros prestados a la vez', v_max;
    end if;

    update libros set stock = stock - 1
    where id_libro = new.id_libro and stock > 0;

    if not found then
      raise exception 'No hay stock disponible de este libro';
    end if;
  end if;

  return new;
end;
$$;

create trigger trg_validar_prestamo_nuevo
before insert on prestamos
for each row execute function validar_prestamo_nuevo();

create or replace function ajustar_stock_prestamo()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.estado = new.estado then
    return new;
  end if;

  if old.estado = 'reservado' and new.estado = 'activo' then
    update libros set stock = stock - 1
    where id_libro = new.id_libro and stock > 0;
    if not found then
      raise exception 'No hay stock disponible de este libro';
    end if;
  end if;

  if old.estado in ('activo', 'vencido') and new.estado = 'devuelto' then
    update libros set stock = stock + 1 where id_libro = new.id_libro;
    new.fecha_devolucion_real := coalesce(new.fecha_devolucion_real, current_date);
  end if;

  return new;
end;
$$;

create trigger trg_ajustar_stock_prestamo
before update of estado on prestamos
for each row execute function ajustar_stock_prestamo();

create or replace function generar_multa_automatica()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_tarifa  decimal(10,2);
  v_dias    int;
  v_importe decimal(10,2);
  v_titulo  text;
begin
  if new.estado = 'vencido' and old.estado is distinct from 'vencido' then
    if not exists (select 1 from multas where id_prestamo = new.id_prestamo) then
      select multa_diaria into v_tarifa from configuracion where id = 1;
      v_dias    := greatest(current_date - new.fecha_devolucion_prevista, 1);
      v_importe := v_dias * v_tarifa;

      insert into multas (id_prestamo, fecha_multa, importe, estado)
      values (new.id_prestamo, current_date, v_importe, 'pendiente');

      select titulo into v_titulo from libros where id_libro = new.id_libro;
      insert into notificaciones (id_cliente, id_libro, tipo, mensaje)
      values (
        new.id_cliente, new.id_libro, 'multa',
        'El préstamo de "' || v_titulo || '" está vencido. Se generó una multa de $' || v_importe || '.'
      );
    end if;
  end if;
  return new;
end;
$$;

create trigger trigger_generar_multa
after update on prestamos
for each row execute function generar_multa_automatica();

create or replace function notificar_libro_disponible()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.stock = 0 and new.stock > 0 then
    insert into notificaciones (id_cliente, id_libro, tipo, mensaje)
    select r.id_cliente, new.id_libro, 'disponible',
           'El libro "' || new.titulo || '" ya está disponible para retirar.'
    from reservas r
    where r.id_libro = new.id_libro and r.estado = 'pendiente';
  end if;
  return new;
end;
$$;

create trigger trg_notificar_libro_disponible
after update of stock on libros
for each row execute function notificar_libro_disponible();

create or replace function actualizar_estados()
returns void language plpgsql security definer set search_path = public as $$
begin
  update prestamos set estado = 'vencido'
  where estado = 'activo' and fecha_devolucion_prevista < current_date;

  update reservas set estado = 'expirado'
  where estado = 'pendiente' and fecha_limite < current_date;
end;
$$;

revoke execute on function actualizar_estados() from public, anon;
grant  execute on function actualizar_estados() to authenticated;

create or replace view v_libros_mas_prestados
with (security_invoker = true) as
select l.id_libro, l.titulo, count(p.id_prestamo) as total_prestamos
from libros l
join prestamos p on p.id_libro = l.id_libro
group by l.id_libro, l.titulo
order by total_prestamos desc;

alter table configuracion enable row level security;
create policy "configuracion lectura" on configuracion for select
  using (auth.role() = 'authenticated');
create policy "configuracion admin" on configuracion for all
  using (es_admin()) with check (es_admin());

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

create policy "prestamos cliente solicitar" on prestamos for insert
  with check (es_mi_cliente(id_cliente) and estado = 'activo' and id_administrador is null);

alter table multas enable row level security;
create policy "multas ver" on multas for select
  using (
    es_admin() or exists (
      select 1 from prestamos p
      where p.id_prestamo = multas.id_prestamo and es_mi_cliente(p.id_cliente)
    )
  );
create policy "multas admin" on multas for all
  using (es_admin()) with check (es_admin());

alter table favoritos enable row level security;
create policy "favoritos ver" on favoritos for select
  using (es_admin() or es_mi_cliente(id_cliente));
create policy "favoritos insertar" on favoritos for insert
  with check (es_mi_cliente(id_cliente));
create policy "favoritos borrar" on favoritos for delete
  using (es_mi_cliente(id_cliente));

alter table reservas enable row level security;
create policy "reservas ver" on reservas for select
  using (es_admin() or es_mi_cliente(id_cliente));
create policy "reservas insertar" on reservas for insert
  with check (es_mi_cliente(id_cliente));
create policy "reservas actualizar" on reservas for update
  using (es_admin() or es_mi_cliente(id_cliente));
create policy "reservas borrar" on reservas for delete
  using (es_admin() or es_mi_cliente(id_cliente));

alter table notificaciones enable row level security;
create policy "notificaciones ver" on notificaciones for select
  using (es_admin() or es_mi_cliente(id_cliente));
create policy "notificaciones marcar leida" on notificaciones for update
  using (es_mi_cliente(id_cliente)) with check (es_mi_cliente(id_cliente));
create policy "notificaciones admin" on notificaciones for all
  using (es_admin()) with check (es_admin());

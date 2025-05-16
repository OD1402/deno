DROP TABLE if exists card_shotlar cascade;  -- orsk
CREATE TABLE public.card_shotlar (
	id serial4 NOT NULL,
	scan_session int8 NOT NULL,
	created_at timestamptz NOT NULL default now(),
	updated_at timestamptz NULL,
	orsk_id int8 NOT NULL,
	orsk_time int8 NOT NULL,
	card jsonb NOT NULL,
	CONSTRAINT card_shotlar_orsk_id_orsk_time_key UNIQUE (orsk_id, orsk_time),
	CONSTRAINT card_shotlar_pkey PRIMARY KEY (id)
);

-- drop table if exists facets cascade;
-- create table facets(
-- 	id smallserial primary key, 
-- 	value text not null unique
-- );

drop table if exists scan_sessionlar cascade;
create table scan_sessionlar(
	id serial8 primary key,
	started_at timestamptz not null,
	finished_at timestamptz,
	facet smallint not null
);


drop function if exists add_scan_session(int);
create function add_scan_session(_facet int, out _ret int) 
as $$
declare 
begin
	select 
		into _ret id 
	from scan_sessionlar
	where 
		facet = _facet and 
		finished_at isnull and
		true
	;

    if _ret is null then
        insert into scan_sessionlar (started_at, facet)
		values (NOW(), _facet)
		returning id into _ret;
	end if;
end;
$$ language plpgsql;


drop function if exists add_card_shot(_scan_session int8, _card jsonb);
CREATE OR REPLACE FUNCTION public.add_card_shot(_scan_session bigint, _card jsonb, OUT _ret integer)
 RETURNS integer
 LANGUAGE plpgsql
AS $function$
declare 
	_orsk_id int8;
	_orsk_time int8;
begin
	_orsk_id = _card#>'{external_id}';
	_orsk_time = _card#>'{external_timestampt}';
	select 
		into _ret id 
	from card_shotlar
	where 
		orsk_id = _orsk_id and 
		orsk_time = _orsk_time and
		true;
	
	if _ret is null then
		insert into card_shotlar (scan_session, orsk_id, orsk_time, card)
		values (_scan_session, _orsk_id, _orsk_time, _card)
		returning id into _ret;
	else
		update card_shotlar 
		set scan_session = _scan_session, updated_at = now()
		where id = _ret;
	end if;
end;
$function$;

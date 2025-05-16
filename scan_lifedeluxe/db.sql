DROP TABLE if exists card_shotlar cascade;
CREATE TABLE public.card_shotlar (
	id serial4 NOT NULL,
	scan_session int8 NOT NULL,
	created_at timestamptz NOT NULL default now(),
	updated_at timestamptz NULL,
	external_id int8 NOT NULL,
	external_time int8 NOT NULL,
	card jsonb NOT NULL,
	CONSTRAINT card_shotlar_external_id_external_time_key UNIQUE (external_id, external_time),
	CONSTRAINT card_shotlar_pkey PRIMARY KEY (id)
);

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
	_external_id int8;
	_external_time int8;
begin
	_external_id = _card#>'{external_id}';
	_external_time = _card#>'{external_timestamp}';
	select 
		into _ret id 
	from card_shotlar
	where 
		external_id = _external_id and 
		external_time = _external_time and
		true;
	
	if _ret is null then
		insert into card_shotlar (scan_session, external_id, external_time, card)
		values (_scan_session, _external_id, _external_time, _card)
		returning id into _ret;
	else
		update card_shotlar 
		set scan_session = _scan_session, updated_at = now()
		where id = _ret;
	end if;
end;
$function$;

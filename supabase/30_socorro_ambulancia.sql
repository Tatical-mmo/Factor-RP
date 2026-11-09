-- Fator RP - socorro com ambulância de jogador.
-- O ferido pode ser socorrido por um médico por até 90 s (tempo para o socorrista chegar dirigindo).
-- Com médico em serviço online, a ambulância NPC espera 40 s antes de sair (o jogo decide).

create or replace function public.socorrer(p_alvo uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare p perfis%rowtype; v perfis%rowtype;
begin
  p := jogador_livre();
  if p.profissao is distinct from 'medico' then raise exception 'so medicos em servico'; end if;
  if p_alvo = p.id then raise exception 'voce nao pode se socorrer'; end if;
  select * into v from perfis where id = p_alvo for update;
  if v.id is null or v.ultima_morte is null or v.ultima_morte < now() - interval '90 seconds' then raise exception 'essa pessoa nao esta ferida'; end if;
  if v.socorrido_em is not null and v.socorrido_em >= v.ultima_morte then raise exception 'ja foi socorrida'; end if;
  update perfis set socorrido_em = now() where id = v.id;
  update perfis set moedas = moedas + 250 where id = p.id;
  insert into comandos (alvo, autor, tipo, dados) values (v.id, p.id, 'socorro', jsonb_build_object('medico', p.nome));
  return 250;
end $$;

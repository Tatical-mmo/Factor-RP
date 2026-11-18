-- 119: música da Saveiro com som enviada do celular (MP3 até 10 MB). Cada jogador tem uma pasta com o id dele e só
-- guarda uma música por vez (o jogo apaga a anterior). Só quem tem Saveiro com som envia; todo mundo pode ouvir.
-- O link continua registrado em som_saveiro (moderação vê em sons_recentes). Rode depois do 118.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('musicas', 'musicas', true, 10485760, array['audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/ogg', 'audio/wav', 'audio/x-wav'])
on conflict (id) do update set public = true, file_size_limit = 10485760, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists musicas_ler on storage.objects;
create policy musicas_ler on storage.objects for select using (bucket_id = 'musicas');
drop policy if exists musicas_enviar on storage.objects;
create policy musicas_enviar on storage.objects for insert to authenticated
  with check (bucket_id = 'musicas' and (storage.foldername(name))[1] = auth.uid()::text
              and exists (select 1 from public.carros c where c.dono = auth.uid() and c.modelo = 'saveiro_som'));
drop policy if exists musicas_apagar on storage.objects;
create policy musicas_apagar on storage.objects for delete to authenticated
  using (bucket_id = 'musicas' and ((storage.foldername(name))[1] = auth.uid()::text
         or exists (select 1 from public.perfis a where a.id = auth.uid() and a.cargo in ('admin', 'moderador'))));

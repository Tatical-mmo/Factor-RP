// Rede: contas, perfis (Supabase) e tempo real (Supabase Realtime)
import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = 'https://uqiiztzdkjyewhdikabd.supabase.co';
export const SUPABASE_CHAVE = 'sb_publishable_diSzJqF0E4FLIALaI5UQLg_JUGJehS3';

export const sb = createClient(SUPABASE_URL, SUPABASE_CHAVE, {
  auth: { persistSession: true, autoRefreshToken: true },
  realtime: { params: { eventsPerSecond: 20 } },
});

const ERROS = {
  'Invalid login credentials': 'E-mail ou senha incorretos.',
  'User already registered': 'Esse e-mail já tem conta. Use Entrar.',
  'Email not confirmed': 'Confirme o e-mail antes de entrar (veja sua caixa de entrada).',
  'Password should be at least 6 characters.': 'A senha precisa ter pelo menos 6 caracteres.',
};
function traduzir(e) {
  if (!e) return '';
  for (const [k, v] of Object.entries(ERROS)) if (e.message?.startsWith(k)) return v;
  if (e.code === '23505') return 'Esse nome já está em uso. Escolha outro.';
  if (e.message?.includes('rate limit')) return 'Muitas tentativas. Espere um pouco e tente de novo.';
  return e.message || String(e);
}

export async function sessaoAtual() {
  const { data } = await sb.auth.getSession();
  return data.session;
}
export async function entrar(email, senha) {
  const { data, error } = await sb.auth.signInWithPassword({ email, password: senha });
  if (error) throw new Error(traduzir(error));
  return data.session;
}
export async function cadastrar(email, senha) {
  const { data, error } = await sb.auth.signUp({ email, password: senha });
  if (error) throw new Error(traduzir(error));
  if (!data.session) throw new Error('Conta criada! Confirme pelo link enviado ao seu e-mail e depois toque em Entrar.');
  return data.session;
}
export async function sair() { await sb.auth.signOut(); }

export async function carregarPerfil(id) {
  const { data, error } = await sb.from('perfis').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(traduzir(error));
  return data;
}
export async function criarPerfil(id, nome, personagem) {
  const { data, error } = await sb.from('perfis').insert({ id, nome, personagem }).select().single();
  if (error) throw new Error(traduzir(error));
  return data;
}
export async function salvarPosicao(id, x, z) {
  await sb.from('perfis').update({ pos_x: x, pos_z: z, visto_em: new Date().toISOString() }).eq('id', id);
}

// ---------------------------------------------------------------- tempo real
// Um canal para a cidade inteira: presença (quem está online) e mensagens de posição/ações.
export function conectarCidade(perfil, eventos) {
  const canal = sb.channel('cidade', {
    config: { presence: { key: perfil.id }, broadcast: { self: false, ack: false } },
  });
  canal.on('presence', { event: 'sync' }, () => {
    const estado = canal.presenceState();
    const lista = {};
    for (const [id, metas] of Object.entries(estado)) if (metas[0]) lista[id] = metas[0];
    eventos.presenca?.(lista);
  });
  canal.on('broadcast', { event: 'pos' }, ({ payload }) => eventos.pos?.(payload));
  canal.on('broadcast', { event: 'tiro' }, ({ payload }) => eventos.tiro?.(payload));
  canal.subscribe(async (status) => {
    if (status === 'SUBSCRIBED') {
      await canal.track({ nome: perfil.nome, personagem: perfil.personagem, cargo: perfil.cargo });
      eventos.conectado?.(true);
    } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
      eventos.conectado?.(false);
    }
  });
  return {
    enviar(evento, payload) { canal.send({ type: 'broadcast', event: evento, payload }); },
    fechar() { sb.removeChannel(canal); },
  };
}

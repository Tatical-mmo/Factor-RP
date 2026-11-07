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
    rastrear(meta) { return canal.track(meta); },
    fechar() { sb.removeChannel(canal); },
  };
}

// ---------------------------------------------------------------- escuta do próprio perfil e de comandos
export function escutarMeuPerfil(id, eventos) {
  const canal = sb.channel('eu-' + id)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'perfis', filter: `id=eq.${id}` }, (p) => eventos.perfil?.(p.new))
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'comandos', filter: `alvo=eq.${id}` }, (p) => eventos.comando?.(p.new))
    .subscribe();
  return () => sb.removeChannel(canal);
}

// ---------------------------------------------------------------- painel (todas verificadas no banco)
async function rpc(nome, args = {}) {
  const { data, error } = await sb.rpc(nome, args);
  if (error) throw new Error(traduzirRpc(error.message));
  return data;
}
function traduzirRpc(m) {
  const t = {
    'sem permissao': 'Você não tem esse poder.',
    'voce nao pode banir esse jogador': 'Você não pode banir esse jogador.',
    'voce nao pode desbanir esse jogador': 'Você não pode desbanir esse jogador.',
    'voce nao pode algemar esse jogador': 'Você não pode algemar esse jogador.',
    'voce nao pode prender esse jogador': 'Você não pode prender esse jogador.',
    'voce nao pode mover esse jogador': 'Você não pode mover esse jogador.',
    'voce nao pode mudar as moedas desse jogador': 'Você não pode mudar as moedas desse jogador.',
    'moderador nao muda as proprias moedas': 'Moderador não pode mudar as próprias moedas.',
    'algemas nao funcionam na equipe': 'Algemas não funcionam em moderadores nem no administrador.',
    'a equipe nao pode ser presa': 'Moderadores e o administrador não podem ser presos.',
    'so o administrador pode fazer isso': 'Só o administrador pode fazer isso.',
    'voce nao pode mudar o proprio cargo': 'Você não pode mudar o próprio cargo.',
    'nao e possivel mudar outro administrador': 'Não é possível mudar outro administrador.',
    'so a equipe troca de skin de graca': 'Só a equipe troca de skin de graça.',
    'tempo invalido': 'Tempo inválido (0 a 1440 minutos).',
    'valor muito alto': 'Valor muito alto.',
    'jogador nao encontrado': 'Jogador não encontrado.',
  };
  return t[m] || m;
}
export const painel = {
  moedas: (alvo, valor) => rpc('admin_moedas', { alvo, valor }),
  banir: (alvo, motivo) => rpc('admin_banir', { alvo, motivo }),
  desbanir: (alvo) => rpc('admin_desbanir', { alvo }),
  algemar: (alvo, ligado) => rpc('admin_algemar', { alvo, ligado }),
  prender: (alvo, minutos) => rpc('admin_prender', { alvo, minutos }),
  teleporte: (alvo, x, z) => rpc('admin_teleporte', { alvo, x, z }),
  definirCargo: (alvo, novo_cargo, novos_poderes, novo_salario) => rpc('admin_definir_cargo', { alvo, novo_cargo, novos_poderes, novo_salario }),
  skin: (novo) => rpc('staff_skin', { novo }),
  imortal: (ligado) => rpc('staff_imortal', { ligado }),
};
export const cumprirPena = () => rpc('cumprir_pena');
export const receberSalario = () => rpc('receber_salario');

export async function buscarJogadores(texto) {
  let q = sb.from('perfis').select('id,nome,cargo,personagem,moedas,banido,banido_motivo,algemado,pena_seg,poderes,salario,visto_em').order('nome').limit(40);
  if (texto) q = q.ilike('nome', `%${texto.replace(/[%_]/g, '')}%`);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data;
}
export async function listarEquipe() {
  const { data, error } = await sb.from('perfis').select('id,nome,cargo,poderes,salario').neq('cargo', 'jogador').order('nome');
  if (error) throw new Error(error.message);
  return data;
}
export async function historico() {
  const { data, error } = await sb.from('registro_admin').select('acao,detalhes,criado_em,autor:perfis!registro_admin_autor_fkey(nome),alvo:perfis!registro_admin_alvo_fkey(nome)').order('criado_em', { ascending: false }).limit(40);
  if (error) throw new Error(error.message);
  return data;
}

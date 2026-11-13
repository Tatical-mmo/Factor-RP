-- 74b · Liga a exigência da assinatura do jogo (rode SÓ depois que a versão 20261113zh estiver no ar e você
-- tiver aberto o jogo uma vez, para conferir que está tudo certo). A partir daqui, pedido sem a assinatura é recusado.
-- Para desligar: update public.seguranca set exigir_assinatura = false where id = 1;
update public.seguranca set exigir_assinatura = true where id = 1;

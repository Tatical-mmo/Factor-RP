-- 99 · Máscara "camisa enrolada (vermelha)" no mesmo ajuste da cinza (é o mesmo formato de máscara): fica igual
-- em todos os personagens. Se a cinza não tem ajuste salvo, a vermelha volta ao padrão do jogo.
update public.config_jogo
   set farda = case when farda ? 'mk:mascara_camisa_cinza'
                    then jsonb_set(farda, '{mk:mascara_camisa_vermelha}', farda -> 'mk:mascara_camisa_cinza')
                    else farda - 'mk:mascara_camisa_vermelha' end
 where true;

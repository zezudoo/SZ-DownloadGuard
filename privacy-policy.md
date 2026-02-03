# Politica de Privacidade - SZ Download Guard Coopavel

Ultima atualizacao: 03/02/2026

## 1) Sobre esta extensao

A extensao **SZ Download Guard Coopavel** aplica uma politica de allowlist para downloads iniciados no dominio `https://coopavelcoop.sz.chat/*`, com o objetivo de bloquear tipos de arquivo nao permitidos.

## 2) Quais dados sao tratados

Para funcionar, a extensao pode tratar localmente:

- URLs de download, nome de arquivo e MIME associados ao download.
- Interacoes tecnicas de navegacao no dominio protegido (por exemplo, clique em links que disparam download).
- Configuracoes e cache tecnico da policy de seguranca (armazenamento local da extensao).

A extensao **nao coleta** dados pessoais para perfilamento, marketing ou venda.

## 3) Como os dados sao usados

Os dados sao usados somente para:

- determinar se um download deve ser permitido ou bloqueado;
- atualizar e validar a policy remota de tipos permitidos;
- mostrar notificacoes de bloqueio;
- manter configuracoes tecnicas da extensao.

## 4) Compartilhamento e venda de dados

- Nao vendemos dados de usuarios.
- Nao transferimos dados de usuarios para terceiros fora dos casos tecnicos necessarios ao funcionamento da extensao.
- Nao usamos dados para credito, emprestimo ou decisoes semelhantes.

## 5) Permissoes da extensao e justificativa

- `downloads`: avaliar e bloquear downloads nao permitidos.
- `notifications`: informar bloqueios e estado de seguranca.
- `storage`: salvar configuracoes e cache da policy.
- `alarms`: atualizar periodicamente a policy.
- `host_permissions`:
  - `https://coopavelcoop.sz.chat/*` para proteger downloads no dominio alvo;
  - `https://gist.githubusercontent.com/*` para buscar o JSON da policy remota.

## 6) Codigo remoto

A extensao nao executa codigo remoto.  
Ela apenas baixa um arquivo JSON de configuracao (policy), tratado como dado.

## 7) Retencao e armazenamento

Os dados tecnicos da extensao ficam no armazenamento local do navegador (`chrome.storage`).  
Voce pode remover esses dados a qualquer momento limpando os dados da extensao ou desinstalando-a.

## 8) Seguranca

Adotamos abordagem de minimo privilegio e validacao estrita da policy remota (schema, modo, TTL e listas permitidas) antes de aplicar regras.

## 9) Seus controles

Voce pode:

- alterar a URL da policy nas opcoes da extensao;
- forcar atualizacao manual da policy;
- remover/desinstalar a extensao a qualquer momento.

## 10) Alteracoes desta politica

Esta politica pode ser atualizada para refletir mudancas tecnicas, legais ou operacionais.  
A data no topo indica a versao mais recente.

## 11) Contato

Responsavel pelo item: **Jose / Equipe SZ Download Guard Coopavel**  
Contato: **[preencher e-mail oficial antes da publicacao]**


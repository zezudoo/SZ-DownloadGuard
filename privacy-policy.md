# Política de Privacidade - SZ Download Guard Coopavel

Última atualização: 03/02/2026

English version: [Privacy Policy (English)](https://github.com/zezudoo/SZ-DownloadGuard/blob/main/privacy-policy.en.md)

## 1) Sobre esta extensão

A extensão **SZ Download Guard Coopavel** aplica uma política de allowlist para downloads iniciados no domínio `https://coopavelcoop.sz.chat/*`, com o objetivo de bloquear tipos de arquivo não permitidos.

## 2) Quais dados são tratados

Para funcionar, a extensão pode tratar localmente:

- URLs de download, nome de arquivo e MIME associados ao download.
- Interações técnicas de navegação no domínio protegido (por exemplo, clique em links que disparam download).
- Configurações e cache técnico da policy de segurança (armazenamento local da extensão).

A extensão **não coleta** dados pessoais para perfilamento, marketing ou venda.

## 3) Como os dados são usados

Os dados são usados somente para:

- determinar se um download deve ser permitido ou bloqueado;
- atualizar e validar a policy remota de tipos permitidos;
- mostrar notificações de bloqueio;
- manter configurações técnicas da extensão.

## 4) Compartilhamento e venda de dados

- Não vendemos dados de usuários.
- Não transferimos dados de usuários para terceiros fora dos casos técnicos necessários ao funcionamento da extensão.
- Não usamos dados para crédito, empréstimo ou decisões semelhantes.

## 5) Permissões da extensão e justificativa

- `downloads`: avaliar e bloquear downloads não permitidos.
- `notifications`: informar bloqueios e estado de segurança.
- `storage`: salvar configurações e cache da policy.
- `alarms`: atualizar periodicamente a policy.
- `host_permissions`:
  - `https://coopavelcoop.sz.chat/*` para proteger downloads no domínio alvo;
  - `https://gist.githubusercontent.com/*` para buscar o JSON da policy remota.

## 6) Código remoto

A extensão não executa código remoto.  
Ela apenas baixa um arquivo JSON de configuração (policy), tratado como dado.

## 7) Retenção e armazenamento

Os dados técnicos da extensão ficam no armazenamento local do navegador (`chrome.storage`).  
Você pode remover esses dados a qualquer momento limpando os dados da extensão ou desinstalando-a.

## 8) Segurança

Adotamos abordagem de mínimo privilégio e validação estrita da policy remota (schema, modo, TTL e listas permitidas) antes de aplicar regras.

## 9) Seus controles

Você pode:

- alterar a URL da policy nas opções da extensão;
- forçar atualização manual da policy;
- remover/desinstalar a extensão a qualquer momento.

## 10) Alterações desta política

Esta política pode ser atualizada para refletir mudanças técnicas, legais ou operacionais.  
A data no topo indica a versão mais recente.

## 11) Contato

Responsável pelo item: **José Pedro Souza de Siqueira / Equipe SZ Download Guard Coopavel**  
Contato: **jose@coopavel.com.br**

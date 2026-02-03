# Privacy Policy - SZ Download Guard Coopavel

Last updated: 2026-02-03

Versão em Português: [Política de Privacidade (Português)](https://github.com/zezudoo/SZ-DownloadGuard/blob/main/privacy-policy.md)

## 1) About this extension

The **SZ Download Guard Coopavel** extension applies an allowlist policy to downloads initiated on `https://coopavelcoop.sz.chat/*`, with the goal of blocking non-authorized file types.

## 2) What data is processed

To operate, the extension may process locally:

- Download URLs, file names, and MIME types related to each download.
- Technical browsing interactions on the protected domain (for example, clicks that trigger downloads).
- Security policy configuration and cache data (extension local storage).

The extension **does not collect** personal data for profiling, marketing, or sale.

## 3) How data is used

Data is used only to:

- decide whether a download should be allowed or blocked;
- fetch and validate the remote policy for allowed file types;
- show block/security notifications;
- keep technical extension settings.

## 4) Data sharing and sale

- We do not sell user data.
- We do not transfer user data to third parties outside technical cases required for extension operation.
- We do not use data for credit, lending, or similar decisions.

## 5) Extension permissions and justification

- `downloads`: evaluate and block non-authorized downloads.
- `notifications`: inform users about blocked downloads and security status.
- `storage`: save settings and policy cache.
- `alarms`: periodically refresh the policy.
- `host_permissions`:
  - `https://coopavelcoop.sz.chat/*` to protect downloads on the target domain;
  - `https://gist.githubusercontent.com/*` to fetch the remote policy JSON.

## 6) Remote code

The extension does not execute remote code.  
It only downloads a JSON configuration file (policy), treated as data.

## 7) Retention and storage

Technical extension data is stored locally in the browser (`chrome.storage`).  
You can remove this data at any time by clearing extension data or uninstalling the extension.

## 8) Security

We use a least-privilege approach and strict validation of the remote policy (schema, mode, TTL, and allowed lists) before applying rules.

## 9) Your controls

You can:

- change the policy URL in extension options;
- force a manual policy refresh;
- remove/uninstall the extension at any time.

## 10) Policy changes

This policy may be updated to reflect technical, legal, or operational changes.  
The date at the top indicates the latest version.

## 11) Contact

Responsible party: **José Pedro Souza de Siqueira / SZ Download Guard Coopavel Team**  
Contact: **jose@coopavel.com.br**

# Sicherheit

## Sicherheitslücke melden

Bitte melde Sicherheitslücken **nicht** als öffentliches Issue, sondern privat über
**Security → Report a vulnerability** in diesem Repository
(<https://github.com/deevilius/k-love/security/advisories/new>).

Ich melde mich so schnell wie möglich zurück.

## Unterstützte Versionen

Sicherheitsupdates gibt es nur für die jeweils neueste Version von K-Love.

## Echtheit eines Installers prüfen

Jeder Installer wird ausschließlich von GitHub Actions aus diesem Repository gebaut
und erhält einen signierten Herkunftsnachweis. Prüfen lässt er sich mit der GitHub CLI:

```
gh attestation verify K-Love-Setup-<version>.exe -R deevilius/k-love
```

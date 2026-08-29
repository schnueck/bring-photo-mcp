# TEST/PROD-Betrieb

## TEST

1. Eine dedizierte Bring-TEST-Liste als Name in `BRING_DEFAULT_LIST` und exakt diesen Namen in `BRING_ALLOWED_LISTS` eintragen.
2. `BRING_ENV=test` und einen eindeutigen `BRING_TEST_ITEM_PREFIX` setzen.
3. Optional nur für Copy/Move/Multi-List: eine zweite dedizierte TEST-Liste als `BRING_TEST_SECOND_LIST` konfigurieren und beide Namen exakt in `BRING_ALLOWED_LISTS` führen.
4. `npm run test:e2e` bewusst manuell und nur mit `BRING_ENV=test` starten. Der Harness erzeugt eigene synthetische Bildfixtures und präfixierte Artikel; ohne zweite Liste meldet er Multi-List ehrlich als Skip.
5. Alle erzeugten TEST-Artikel/Fotos werden in `finally` entfernt und per Read-back auf Rückstandsfreiheit geprüft.

## PROD

- Erst nach expliziter Betreiberfreigabe und erfolgreichem TEST-Protokoll.
- Nur ein gepinnter Release-Tag, keine Auto-Updates.
- `BRING_ENV=prod`; `BRING_ALLOWED_LISTS` nur mit tatsächlich freigegebenen PROD-Listen füllen.
- Vor jedem Write Listenauflösung und Allowlist prüfen; keine Fallback-Liste verwenden.
- Keine Zugangsdaten, IDs oder Pfade ausgeben.

## Rollback

Kein Runtime-Wiring ist Bestandteil dieses Repositorys. Bei Problemen keine automatische Umschaltung: die bestehende `bring-safe`-Lösung bleibt unverändert, bis eine getestete und freigegebene Integration erfolgt.

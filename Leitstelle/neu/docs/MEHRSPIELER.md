# Mehrspieler mit Freunden (über das Internet)

Ein PC ist **Gastgeber**: Dort läuft die Simulation. Bis zu vier Spieler (Gastgeber + drei Freunde) spielen im selben Leitstand. Jeder kann alles. Wer einen Notruf annimmt oder einen Einsatz anlegt, ist dafür zuständig, die anderen sehen „Wird von … bearbeitet“ und können ihn **übernehmen**. Zeit, Geschwindigkeit, Szenarien und Bearbeitung steuert nur der Gastgeber.

Jeder spricht an seinem eigenen PC: Freisprechen mit seinen Anrufern, Funk mit seiner geschalteten Rufgruppe (F8 bzw. „Senden“).

## Verbindung: ZeroTier (kostenlos, auch für Tablets)

ZeroTier baut ein privates virtuelles Netz – für Windows, Android und iPad. So kommen auch die Tablets eurer Freunde an den Gastgeber.

1. Der Gastgeber legt auf my.zerotier.com kostenlos ein Konto und ein Netzwerk an und notiert die **Network ID**.
2. Alle installieren die ZeroTier-App (PC und Tablet) und treten mit der Network ID bei.
3. Der Gastgeber bestätigt auf my.zerotier.com jedes Gerät („Auth“). Dort steht auch die ZeroTier-IP jedes Geräts.
4. Der Gastgeber startet LEITWARTE mit `npm.cmd run lan` und lässt die Windows-Firewall zu (ZeroTier-Netz als **privat** einstufen).
5. Der Gastgeber öffnet `http://localhost:8080`, gibt oben seinen Namen ein und startet eine Leitstelle.
6. Die Freunde öffnen in **Chrome oder Edge**: `http://<ZeroTier-IP des Gastgebers>:8080/mitspielen`, Namen eingeben.
7. **Tablets:** `http://<ZeroTier-IP des Gastgebers>:8080/tablet` öffnen und oben bei „Gehört zu“ den eigenen Namen wählen. Dann löst die Sendetaste am Tablet das Mikrofon am **eigenen** PC aus, und das Tablet zeigt nur die eigenen Notrufabfragen.

Grenzen der kostenlosen Pläne ändern sich gelegentlich (Stand: ZeroTier etwa 10 Geräte, Tailscale 3 Nutzer). Für 4 PCs + 4 Tablets passt ZeroTier.

**Radmin VPN / Hamachi** funktionieren für die PCs genauso (statt ZeroTier-IP die Radmin-/Hamachi-IP), haben aber keine Tablet-App – Tablets gehen damit nur beim Gastgeber.

## Mikrofon bei den Freunden

Browser erlauben das Mikrofon nur auf „sicheren“ Adressen. Für die Gastgeber-IP muss jeder Freund das **einmal** freischalten (wie du es am PC schon gemacht hast):

- Edge: `edge://flags/#unsafely-treat-insecure-origin-as-secure`
- Chrome: `chrome://flags/#unsafely-treat-insecure-origin-as-secure`

Dort `http://<IP des Gastgebers>:8080` eintragen (ohne Schrägstrich am Ende), auf „Aktiviert“ stellen, Browser neu starten. Danach im Funkpanel bzw. in der Einsatzmaske das Mikrofon freigeben.

Ohne diesen Schritt geht alles außer Sprechen (Funksprüche lassen sich tippen, Abfrage per Klick).

## Gut zu wissen

- Datenmenge: Die Leitstellenkonfiguration wird nur bei Änderungen übertragen, sonst nur Fahrzeuge und Laufzeit (komprimiert etwa 10 KB pro halbe Sekunde).
- Funk: Jeder hört die Fahrzeuge seiner geschalteten Rufgruppe; der Gastgeber hört alle (auch für das Tablet).
- Spielstände speichert nur der Gastgeber.
- Der LAN-Server hat keine Anmeldung. Nur in eurem privaten VPN-Netz verwenden, keine Portfreigabe ins offene Internet.

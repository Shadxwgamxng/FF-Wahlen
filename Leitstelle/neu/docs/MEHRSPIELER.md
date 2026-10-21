# Mehrspieler mit Freunden (über das Internet)

Ein PC ist **Gastgeber**: Dort läuft die Simulation. Bis zu vier Spieler (Gastgeber + drei Freunde) spielen im selben Leitstand. Jeder kann alles. Wer einen Notruf annimmt oder einen Einsatz anlegt, ist dafür zuständig, die anderen sehen „Wird von … bearbeitet“ und können ihn **übernehmen**. Zeit, Geschwindigkeit, Szenarien und Bearbeitung steuert nur der Gastgeber.

Jeder spricht an seinem eigenen PC: Freisprechen mit seinen Anrufern, Funk mit seiner geschalteten Rufgruppe (F8 bzw. „Senden“).

## Verbindung: Radmin VPN oder Hamachi (kostenlos)

Beide bauen ein virtuelles LAN, als säßet ihr im selben Netz.

1. Alle installieren **Radmin VPN** (oder **Hamachi**).
2. Der Gastgeber erstellt ein Netzwerk (Name + Passwort), die Freunde treten bei.
3. Der Gastgeber startet LEITWARTE mit `npm.cmd run lan` und lässt die Windows-Firewall für **private Netzwerke** zu (Abfrage beim ersten Start; Radmin/Hamachi gilt als privates Netz).
4. Der Gastgeber öffnet `http://localhost:8080`, gibt oben seinen Namen ein und startet eine Leitstelle.
5. Die Freunde öffnen in **Chrome oder Edge**: `http://<Radmin-/Hamachi-IP des Gastgebers>:8080/mitspielen`
   (die IP steht in Radmin/Hamachi beim Gastgeber, z. B. `26.12.34.56` bzw. `25.x.x.x`), Namen eingeben, fertig.

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

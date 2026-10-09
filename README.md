# AtlasCube Radio Card

A compact, modern Home Assistant Lovelace card for AtlasCube radio devices.

> **Current status: v0.4 TEST**
>
> The card is currently in public testing and is being prepared for publication as a HACS Dashboard element. The configuration and UI may still change before the first stable release.

---

## 🇬🇧 English

### Features

- Automatic detection of the AtlasCube device and its entities
- No hard-coded AtlasCube device name required
- Compact Previous / Play-Stop / Next controls
- Large central Play/Stop button
- Optional album artwork with artist, title and album information
- Station name and current track information
- Source selector
- Volume slider and mute control
- Dynamic online/offline state
- Rainbow radio animation while playing
- Wi-Fi-off indicator when the device is offline
- Automatically opens the AtlasCube web interface from the Home Assistant device configuration_url
- Uses the native MQTT availability state propagated by Home Assistant
- Does not require a separate ping sensor
- Optional manual availability override
- Optional album artwork, source and volume sections

### Requirements

- Home Assistant
- AtlasCube radio integrated into Home Assistant
- AtlasCube entities available through the MQTT integration
- HACS is recommended for installation

The card discovers the AtlasCube device from the Home Assistant device/entity registries instead of depending on a fixed entity naming scheme.

### Installation with HACS

#### During testing

Until the card is accepted into the default HACS repository list:

1. Open HACS.
2. Open the three-dot menu in the upper-right corner.
3. Select Custom repositories.
4. Add `MarLip1981/atlascube-radio-card`.
5. Select Dashboard as the repository type.
6. Install AtlasCube Radio Card.
7. Reload the Home Assistant frontend if requested.

#### Future stable publication

The goal is to publish the card as a regular HACS Dashboard repository. HACS requires a public GitHub repository, a valid `hacs.json`, suitable repository metadata and a passing HACS validation. A GitHub Release is required for submission to the default HACS repository list.

### Automatic configuration

After adding the card to a dashboard, open the card editor and use:

**Automatically detect AtlasCube**

The editor detects the AtlasCube device and fills the main entity fields automatically:

- Station
- Track title
- Playback state
- Volume
- Source
- Previous
- Play
- Stop
- Next

The Availability field is optional and should normally remain empty.

### MQTT availability

AtlasCube exposes its availability through MQTT. Home Assistant processes this availability information and applies it to the native AtlasCube entities.

The card therefore uses the state of the native AtlasCube entities as the frontend representation of MQTT availability:

- normal entity state → AtlasCube online
- `unavailable` / `unknown` → AtlasCube offline

A separate `binary_sensor` ping helper is not required.

A manually selected availability entity can still be configured as an explicit override when needed.

### Web interface

Clicking the card header opens the AtlasCube web interface.

The address is obtained automatically from the AtlasCube device `configuration_url`.

You do not need to enter the device IP address manually.

### Manual YAML configuration

    type: custom:atlascube-radio-card

    radio:
      station: sensor.atlascube_radio_stacja_radiowa
      title: sensor.atlascube_radio_tytul_utworu
      playback: sensor.atlascube_9140_playback
      volume: number.salon_atlascube_radio_glosnosc
      source: select.atlascube_9140_source
      previous: button.atlascube_9140_previous
      play: button.atlascube_9140_play
      stop: button.atlascube_9140_stop
      next: button.atlascube_9140_next
      # availability: optional manual override

    show_artwork: true
    show_artwork: true
    show_source: true
    show_volume: true

### Album artwork

Album artwork is optional and can be enabled or disabled in the card editor.

When enabled and the radio is playing, the card uses the current `Artist - Title` metadata to search the iTunes Search API, caches the result and displays a 200×200 cover with a subtle 18 px blurred background. When the radio is stopped, the artwork and track information are hidden while the blurred background is retained.

When artwork is disabled, the card returns to the compact radio presentation with the animated rainbow radio icon while playing.

### Status indicators

| Indicator | Meaning |
|---|---|
| Radio icon | Online and stopped |
| Rainbow radio icon | Online and playing |
| Wi-Fi-off icon | AtlasCube unavailable/offline |

### Manual installation

Download `atlascube-radio-card.js` from this repository and add it as a Lovelace JavaScript resource.

---

## 🇵🇱 Polski

### Funkcje

- Automatyczne wykrywanie urządzenia AtlasCube i jego encji
- Brak zależności od konkretnej nazwy urządzenia
- Kompaktowe przyciski Poprzednia / Play-Stop / Następna
- Duży centralny przycisk Play/Stop
- Opcjonalne okładki utworów z wykonawcą, tytułem i albumem
- Nazwa stacji i tytuł aktualnego utworu
- Wybór źródła
- Suwak głośności i wyciszenie
- Dynamiczny stan online/offline
- Tęczowa animacja radia podczas odtwarzania
- Ikona Wi-Fi-off, gdy AtlasCube jest niedostępny
- Automatyczne otwieranie panelu WWW AtlasCube na podstawie `configuration_url` urządzenia Home Assistant
- Wykorzystanie natywnej dostępności MQTT obsługiwanej przez Home Assistant
- Brak potrzeby tworzenia osobnego sensora ping
- Opcjonalny ręczny override dostępności
- Opcjonalne okładki, sekcje źródła i głośności

### Wymagania

- Home Assistant
- Radio AtlasCube dodane do Home Assistant
- Encje AtlasCube dostępne przez integrację MQTT
- Zalecane HACS

Karta wykrywa urządzenie na podstawie rejestru urządzeń i encji Home Assistant. Nie zakłada jednej, sztywnej nazwy urządzenia ani adresu IP.

### Instalacja przez HACS

#### W okresie testów

Dopóki karta nie zostanie dodana do domyślnej listy repozytoriów HACS:

1. Otwórz HACS.
2. Otwórz menu trzech kropek w prawym górnym rogu.
3. Wybierz Custom repositories / Niestandardowe repozytoria.
4. Dodaj `MarLip1981/atlascube-radio-card`.
5. Jako typ wybierz Dashboard.
6. Zainstaluj AtlasCube Radio Card.
7. Jeśli Home Assistant o to poprosi, przeładuj frontend.

### Automatyczna konfiguracja

Po dodaniu karty do dashboardu otwórz jej edytor i użyj:

**Automatycznie wykryj AtlasCube**

Edytor automatycznie wyszukuje urządzenie AtlasCube i przypisuje główne encje:

- stacja
- tytuł utworu
- stan odtwarzania
- głośność
- źródło
- poprzednia
- play
- stop
- następna

Pole Dostępność powinno normalnie pozostać puste.

### Dostępność MQTT

AtlasCube przekazuje dostępność przez MQTT. Home Assistant przetwarza tę informację i uwzględnia ją w stanach natywnych encji AtlasCube.

Karta wykorzystuje więc stan encji jako reprezentację dostępności MQTT:

- normalny stan encji → AtlasCube online
- `unavailable` / `unknown` → AtlasCube offline

Nie trzeba tworzyć `binary_sensor.192_168_1_6` ani żadnego innego sensora ping.

Pole dostępności pozostaje dostępne jako ręczny override, jeśli w konkretnej instalacji będzie potrzebny.

### Panel WWW AtlasCube

Kliknięcie nagłówka karty otwiera panel WWW AtlasCube.

Adres jest pobierany automatycznie z `configuration_url` urządzenia Home Assistant.

Nie trzeba wpisywać adresu IP ręcznie.

### Konfiguracja YAML

    type: custom:atlascube-radio-card

    radio:
      station: sensor.atlascube_radio_stacja_radiowa
      title: sensor.atlascube_radio_tytul_utworu
      playback: sensor.atlascube_9140_playback
      volume: number.salon_atlascube_radio_glosnosc
      source: select.atlascube_9140_source
      previous: button.atlascube_9140_previous
      play: button.atlascube_9140_play
      stop: button.atlascube_9140_stop
      next: button.atlascube_9140_next
      # availability: opcjonalny ręczny override

    show_source: true
    show_volume: true

### Okładki utworów

Okładki utworów można włączyć lub wyłączyć w edytorze karty.

Po włączeniu, podczas odtwarzania karta wyszukuje okładkę na podstawie metadanych `Artysta - Tytuł`, zapamiętuje wynik i pokazuje okładkę 200×200 px z delikatnie rozmytym tłem 18 px. Po zatrzymaniu radia okładka i informacje o utworze są ukrywane, ale rozmyte tło pozostaje.

Po wyłączeniu okładek karta wraca do kompaktowego widoku radia z tęczową animacją podczas odtwarzania.

### Wskaźniki stanu

| Wskaźnik | Znaczenie |
|---|---|
| Ikona radia | Online i zatrzymane |
| Tęczowa ikona radia | Online i odtwarzanie |
| Ikona Wi-Fi-off | AtlasCube niedostępny/offline |

### Instalacja ręczna

Pobierz `atlascube-radio-card.js` z tego repozytorium i dodaj go jako zasób JavaScript Lovelace.

---

## Screenshots

### Card in Home Assistant

![AtlasCube Radio Card in Home Assistant](./Screenshot_20261003_183147_Home%20Assistant.jpg)

### Card configuration editor

![AtlasCube Radio Card configuration editor](./Screenshot_20261003_183250_Home%20Assistant.jpg)

### Additional card views

![AtlasCube Radio Card view](./Screenshot_20261003_183309_Home%20Assistant.jpg)

![AtlasCube Radio Card configuration and preview](./Screenshot_20261003_183337_Home%20Assistant.jpg)

## Development status

**v0.4 TEST**

This version is intentionally still marked as a test release.

The current v0.4 test focuses on:

- AtlasCube auto-discovery
- optional album artwork
- native MQTT-derived availability
- automatic web interface discovery
- online/offline card behavior
- stable basic radio controls

Brightness, LED ring, SD card and URL playback controls are intentionally not exposed by default.

## HACS publication checklist

- [x] Public GitHub repository
- [x] `hacs.json`
- [x] Dashboard/plugin repository structure
- [x] License
- [x] README documentation
- [x] HACS validation workflow
- [x] Real screenshots in README
- [ ] GitHub repository description
- [ ] GitHub repository topics
- [ ] Verify GitHub Issues are enabled
- [ ] Create the first GitHub Release
- [ ] Run and pass HACS validation
- [ ] Submit repository to the HACS default `plugin` list

For publication in the default HACS repository list, the repository must pass HACS validation and have the required repository metadata. Plugin repositories also need images in the README.

## License

MIT License — see [LICENSE](LICENSE).

## Repository

`MarLip1981/atlascube-radio-card`


## Station logo test

This repository is a separate test build for radio station logo lookup via Radio Browser. If a logo cannot be found, the card displays the station name instead of using an icon fallback.


## Logo stacji — test źródła

Karta testowa utrzymuje nazwę stacji widoczną podczas wyszukiwania i rezerwuje stałą wysokość dla nazwy/logo, aby układ nie skakał.

Opcjonalnie można podać **Logo.dev publishable key** w edytorze karty. Klucz publiczny zaczyna się od `pk_` i jest przeznaczony do użycia w przeglądarce. **Nie wklejaj klucza sekretnego `sk_` do karty ani do repozytorium.** Klucz można uzyskać na stronie [Logo.dev](https://www.logo.dev/). Bez klucza karta pozostawia nazwę stacji i próbuje użyć dokładnego dopasowania Radio Browser jako źródła awaryjnego.

Logo.dev jest katalogiem marek, a nie specjalistycznym katalogiem stacji radiowych, więc wynik nadal trzeba sprawdzić dla kilku stacji. Jeśli serwis nie zwróci grafiki, karta wróci do tekstowej nazwy stacji.

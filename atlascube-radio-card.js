class AtlasCubeRadioCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = null;
    this._hass = null;
    this._deviceRegistry = null;
    this._entityRegistry = null;
    this._registryLoading = false;
    this._cache = new Map();
    this._stationLogoCache = new Map();
    this._requestId = 0;
    this._stationLogoRequestId = 0;
    this._lastTrack = "";
    this._lastStation = "";
    this._lastRenderSignature = "";
  }

  setConfig(config) {
    this._config = {
      show_artwork: true,
      show_station_logo: true,
      show_source: true,
      show_volume: true,
      ...config,
      radio: { ...(config?.radio || {}) }
    };

    this._cache = new Map();
    this._requestId = 0;
    this._lastRenderSignature = "";
    this._render();
  }

  static getConfigElement() {
    return document.createElement("atlascube-radio-card-station-logo-test-editor");
  }

  static getStubConfig() {
    return {
      show_artwork: true,
      show_station_logo: true,
      show_source: true,
      show_volume: true,
      radio: {}
    };
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._deviceRegistry && !this._registryLoading) this._loadRegistries().then(() => this._render());
    const track = this._getTrack();
    if (track !== this._lastTrack) {
      this._lastTrack = track;
      if (this._config.show_artwork !== false) this._loadArtwork();
    }

    const station = this._getStation();
    if (station !== this._lastStation) {
      this._lastStation = station;
      if (this._config.show_station_logo !== false) this._loadStationLogo();
    } else if (station && this._config.show_station_logo !== false &&
        this._stationLogo && !this._stationLogo.logo && !this._stationLogo.loading &&
        this._stationLogo.retryAt && Date.now() >= this._stationLogo.retryAt) {
      this._loadStationLogo();
    }
    const signature = this._renderStateSignature();
    if (signature !== this._lastRenderSignature) {
      this._lastRenderSignature = signature;
      this._render();
    }
  }

  getCardSize() {
    return this._config?.show_artwork === false ? 5 : 6;
  }

  async _loadRegistries() {
    if (!this._hass || this._registryLoading) return;
    this._registryLoading = true;
    try {
      const [devices, entities] = await Promise.all([
        this._hass.callWS({ type: "config/device_registry/list" }),
        this._hass.callWS({ type: "config/entity_registry/list" })
      ]);
      this._deviceRegistry = devices || [];
      this._entityRegistry = entities || [];
    } catch (err) {
      console.warn("AtlasCube Radio Card: nie udało się pobrać rejestru urządzeń.", err);
    } finally {
      this._registryLoading = false;
    }
  }

  _webUrl() {
    const r = this._config?.radio || {};
    const entityIds = [
      r.station, r.title, r.playback, r.volume, r.source,
      r.previous, r.play, r.stop, r.next
    ].filter(Boolean);

    for (const entityId of entityIds) {
      const entity = (this._entityRegistry || []).find(item => item.entity_id === entityId);
      if (!entity?.device_id) continue;
      const device = (this._deviceRegistry || []).find(item => item.id === entity.device_id);
      if (device?.configuration_url) return device.configuration_url;
    }

    return null;
  }

  _getTrack() {
    const stateObj = this._hass?.states?.[this._config.radio.title];
    const value = stateObj?.state;
    return value && value !== "unknown" && value !== "unavailable"
      ? value
      : "";
  }

  _getStation() {
    const stateObj = this._hass?.states?.[this._config.radio.station];
    const value = stateObj?.state;
    return value && value !== "unknown" && value !== "unavailable"
      ? String(value).trim()
      : "";
  }

  _renderStateSignature() {
    const r = this._config?.radio || {};
    const read = entityId => {
      if (!entityId) return null;
      const obj = this._hass?.states?.[entityId];
      if (!obj) return null;
      return {
        state: obj.state,
        options: obj.attributes?.options,
        min: obj.attributes?.min,
        max: obj.attributes?.max
      };
    };
    return JSON.stringify({
      station: read(r.station),
      title: read(r.title),
      playback: read(r.playback),
      volume: read(r.volume),
      source: read(r.source),
      availability: read(r.availability),
      show_artwork: this._config?.show_artwork,
      show_station_logo: this._config?.show_station_logo,
      show_source: this._config?.show_source,
      show_volume: this._config?.show_volume
    });
  }

  _parseTrack(value) {
    const text = String(value || "").trim();
    const match = text.match(/^(.+?)\s+-\s+(.+)$/);

    if (!match) {
      return { artist: "", title: text };
    }

    return {
      artist: match[1].trim(),
      title: match[2].trim()
    };
  }

  _normalize(value) {
    return String(value || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  _scoreResult(result, artist, title) {
    const wantedArtist = this._normalize(artist);
    const wantedTitle = this._normalize(title);
    const resultArtist = this._normalize(result.artistName);
    const resultTitle = this._normalize(result.trackName);

    let score = 0;

    if (resultArtist === wantedArtist) score += 100;
    else if (resultArtist.includes(wantedArtist) || wantedArtist.includes(resultArtist)) score += 40;

    if (resultTitle === wantedTitle) score += 100;
    else if (resultTitle.includes(wantedTitle) || wantedTitle.includes(resultTitle)) score += 40;

    if (result.collectionName) {
      const album = this._normalize(result.collectionName);
      if (album.includes(wantedTitle)) score += 5;
    }

    return score;
  }

  _renderStationIdentity(station, enabled, logo) {
    if (!station || station === "unknown" || station === "unavailable") return "";
    const safeStation = this._escape(station);
    if (!enabled) return "<div class=\"station station-identity-text\">" + safeStation + "</div>";
    if (!logo) return "<div class=\"station-identity\"><div class=\"station station-logo-fallback-visible\">" + safeStation + "</div></div>";
    return "<div class=\"station-identity\"><img class=\"station-logo\" src=\"" + this._escape(logo) + "\" alt=\"\" aria-hidden=\"true\" onerror=\"this.style.display='none';this.nextElementSibling.style.display='block';\"><div class=\"station station-logo-fallback\">" + safeStation + "</div></div>";
  }

  _stationLogoKey(value) {
    let key = this._normalize(value);
    // RMF MAXXX to historyczna pisownia tej samej stacji co obecne RMF MAXX.
    if (key === "rmf maxxx") return "rmf maxx";

    // AtlasCube może zwracać nazwę z dodatkowym prefiksem „Radio”.
    // Każda nazwa zawierająca markę „Polskie Przeboje” trafia do wspólnego
    // klucza; logo i tak musi pochodzić z wyniku Radio Browser z favicon.
    if (key.includes("polskie przeboje")) return "rmf polskie przeboje";

    // Ujednolicamy także pełne nazwy programów Polskiego Radia,
    // np. „Polskie Radio Program 1 (Jedynka)”, do jednego klucza.
    if (/\b(jedynka|program 1)\b/.test(key)) return "polskie radio program 1";
    if (/\b(dwojka|program 2)\b/.test(key)) return "polskie radio program 2";
    if (/\b(trojka|program 3)\b/.test(key)) return "polskie radio program 3";
    return key;
  }

  _stationLogoQueryName(value) {
    const key = this._stationLogoKey(value);
    const aliases = {
      "jedynka": "Polskie Radio Program 1",
      "polskie radio jedynka": "Polskie Radio Program 1",
      "polskie radio program 1": "Polskie Radio Program 1",
      "program 1": "Polskie Radio Program 1",
      "dwojka": "Polskie Radio Program 2",
      "polskie radio dwojka": "Polskie Radio Program 2",
      "polskie radio program 2": "Polskie Radio Program 2",
      "program 2": "Polskie Radio Program 2",
      "trojka": "Polskie Radio Program 3",
      "polskie radio trojka": "Polskie Radio Program 3",
      "polskie radio program 3": "Polskie Radio Program 3",
      "program 3": "Polskie Radio Program 3"
    };
    if (key === "rmf maxx") return "RMF MAXX";
    if (key === "rmf fm") return "RMF FM";
    if (key === "rmf classic") return "RMF CLASSIC";
    if (key === "rmf polskie przeboje") return "RMF Polskie Przeboje";
    return aliases[key] || String(value || "").trim();
  }

  _stationLogoSearchNames(value) {
    const key = this._stationLogoKey(value);
    const aliases = {
      "rmf maxx": ["RMF MAXX", "RMF MAXXX"],
      "rmf polskie przeboje": [
        "RMF Polskie Przeboje",
        "RMF Polskie Przeboje radio",
        "Polskie Przeboje RMF",
        "Polskie Przeboje"
      ],
      "jedynka": ["Polskie Radio Program 1"],
      "polskie radio jedynka": ["Polskie Radio Program 1"],
      "polskie radio program 1": ["Polskie Radio Program 1"],
      "program 1": ["Polskie Radio Program 1"],
      "dwojka": ["Polskie Radio Program 2"],
      "polskie radio dwojka": ["Polskie Radio Program 2"],
      "polskie radio program 2": ["Polskie Radio Program 2"],
      "program 2": ["Polskie Radio Program 2"],
      "trojka": ["Polskie Radio Program 3"],
      "polskie radio trojka": ["Polskie Radio Program 3"],
      "polskie radio program 3": ["Polskie Radio Program 3"],
      "program 3": ["Polskie Radio Program 3"]
    };
    return aliases[key] || [this._stationLogoQueryName(value)];
  }

  _stationLogoStreamUrl(value) {
    // Źródła pochodzą z domyślnej playlisty AtlasCube:
    // spiffs_image/config/playlist.csv w repo marcinozog/AtlasCube.
    // Wyszukiwanie po URL jest pewniejsze niż dopasowanie podobnych nazw.
    const streams = {
      "antyradio": "https://an04.cdn.eurozet.pl/ant-web.mp3",
      "play 90s": "https://live.playradio.org:8443/90HD",
      "paranormalium": "https://shoutcast.paranormalium.pl:8000/1",
      "pr wroclaw": "https://stream4.nadaje.com:9241/prw",
      "eska wroclaw": "https://waw.ic.smcdn.pl/2180-1.mp3",
      "tok fm": "https://go-audio.toya.net.pl/793",
      "wnet": "http://audio.radiownet.pl:8000/stream",
      "polskie radio program 1": "http://mp3.polskieradio.pl:8900/;",
      "polskie radio program 2": "http://mp3.polskieradio.pl:8902/;",
      "polskie radio program 3": "http://mp3.polskieradio.pl:8904/;",
      "rmf fm": "http://195.150.20.242:8000/rmf_fm",
      "radio zet": "http://zet090-02.cdn.eurozet.pl:8404/;",
      "radio zlote przeboje": "http://poznan7.radio.pionier.net.pl:8000/tuba9-1.mp3",
      "rmf maxx": "http://195.150.20.242:8000/rmf_maxxx",
      "vox fm": "https://waw.ic.smcdn.pl/3210-1.mp3",
      "muzo fm": "https://stream.rcs.revma.com/1nnezw8qz7zuv",
      "mc radio": "http://stream4.nadaje.com:10128/mcradio_mp3",
      "melo radio": "https://n-11-24.dcs.redcdn.pl/sc/o2/Eurozet/live/meloradio.livx?audio=5",
      "groovesalad 128": "http://ice2.somafm.com/groovesalad-128-mp3",
      "groovesalad 256": "http://ice2.somafm.com/groovesalad-256-mp3",
      "blues wave": "https://blueswave.radio:8000/blueswave",
      "kossuth aac": "http://mr-stream.mediaconnect.hu/4734/mr1.aac"
    };
    return streams[this._stationLogoKey(value)] || streams[this._normalize(value)] || null;
  }

  async _stationLogoStreamUrlFromDevice(value) {
    // Najpierw czytamy prawdziwą playlistę z urządzenia AtlasCube.
    // Firmware udostępnia GET /api/playlist i włącza CORS.
    // Dopasowanie jest kanoniczne, bez luźnego podobieństwa nazw.
    const wantedKey = this._stationLogoKey(value);
    const webUrl = this._webUrl();
    if (webUrl) {
      try {
        let baseUrl = String(webUrl).trim();
        while (baseUrl.endsWith("/")) baseUrl = baseUrl.slice(0, -1);
        const response = await fetch(baseUrl + "/api/playlist", {
          cache: "no-store",
          headers: { "Accept": "application/json" }
        });
        if (response.ok) {
          const playlist = await response.json();
          if (Array.isArray(playlist)) {
            const match = playlist.find(item =>
              item?.name && item?.url &&
              this._stationLogoKey(item.name) === wantedKey
            );
            if (match?.url) return String(match.url).trim();
          }
        }
      } catch (_) {
        // Jeśli urządzenie nie odpowiada, próbujemy znane URL-e z repozytorium.
      }
    }
    return this._stationLogoStreamUrl(value);
  }

  async _stationLogoRadioBrowserGet(path) {
    const hosts = [
      "all.api.radio-browser.info",
      "de1.api.radio-browser.info",
      "fi1.api.radio-browser.info"
    ];
    for (const host of hosts) {
      try {
        const response = await fetch("https://" + host + path, {
          headers: { "Accept": "application/json" }
        });
        if (!response.ok) continue;
        const data = await response.json();
        if (Array.isArray(data)) return data;
      } catch (_) {
        // Próbujemy kolejnego lustra Radio Browser.
      }
    }
    return [];
  }

  _stationNameTokens(value) {
    return this._normalize(value)
      .split(/\s+/)
      .filter(token => token.length >= 2);
  }

  _levenshtein(a, b) {
    const aa = String(a || "");
    const bb = String(b || "");
    if (aa === bb) return 0;
    if (!aa.length) return bb.length;
    if (!bb.length) return aa.length;

    const prev = Array(bb.length + 1);
    const curr = Array(bb.length + 1);

    for (let j = 0; j <= bb.length; j++) prev[j] = j;

    for (let i = 1; i <= aa.length; i++) {
      curr[0] = i;

      for (let j = 1; j <= bb.length; j++) {
        const cost = aa[i - 1] === bb[j - 1] ? 0 : 1;
        curr[j] = Math.min(
          curr[j - 1] + 1,
          prev[j] + 1,
          prev[j - 1] + cost
        );
      }

      for (let j = 0; j <= bb.length; j++) prev[j] = curr[j];
    }

    return prev[bb.length];
  }

  _stationNameSimilarity(wanted, candidate) {
    const wantedTokens = this._stationNameTokens(wanted);
    const candidateTokens = this._stationNameTokens(candidate);

    if (!wantedTokens.length || !candidateTokens.length) return 0;

    let matched = 0;

    for (const wantedToken of wantedTokens) {
      let best = 0;

      for (const candidateToken of candidateTokens) {
        const distance = this._levenshtein(wantedToken, candidateToken);
        const maxLength = Math.max(wantedToken.length, candidateToken.length);
        const similarity = maxLength ? 1 - distance / maxLength : 0;
        best = Math.max(best, similarity);
      }

      if (best >= 0.88) matched++;
    }

    return matched / wantedTokens.length;
  }

  _stationLogoHasConflictingVariant(wanted, candidate) {
    const wantedKey = this._stationLogoKey(wanted);
    const candidateText = this._normalize(candidate);

    // Rozróżniamy podmarki RMF. Sam wspólny człon „RMF” nigdy nie wystarcza.
    const rmfVariants = ["fm", "maxx", "classic", "on", "24"];
    const wantedRmf = wantedKey.match(/^rmf (fm|maxx|classic|on|24)$/)?.[1];
    const candidateRmfMatch = candidateText.match(/\brmf\s+(fm|maxxx|maxx|classic|on|24)\b/);
    const candidateRmf = candidateRmfMatch?.[1] === "maxxx" ? "maxx" : candidateRmfMatch?.[1];
    if (wantedRmf && candidateRmf && candidateRmf !== wantedRmf) return true;

    // Polskie Radio: Program 1/2/3 oraz Jedynka/Dwójka/Trójka to odrębne marki.
    const wantedProgram = wantedKey.match(/^polskie radio program ([123])$/)?.[1];
    const candidateProgram = candidateText.match(/\bprogram ([123])\b/)?.[1];
    const candidateAlias = /\b(jedynka|dwojka|trojka)\b/.exec(candidateText)?.[1];
    const aliasProgram = candidateAlias === "jedynka" ? "1"
      : candidateAlias === "dwojka" ? "2"
      : candidateAlias === "trojka" ? "3" : null;
    if (wantedProgram && ((candidateProgram && candidateProgram !== wantedProgram) ||
        (aliasProgram && aliasProgram !== wantedProgram))) return true;

    return false;
  }

  _stationLogoScore(result, wanted) {
    const name = String(result?.name || "").trim();
    if (!name || !result?.favicon || this._stationLogoHasConflictingVariant(wanted, name)) return -1;

    const normalizedWanted = this._normalize(wanted);
    const normalizedName = this._normalize(name);
    if (!normalizedWanted || !normalizedName) return -1;

    const wantedKey = this._stationLogoKey(wanted);
    const candidateKey = this._stationLogoKey(name);
    // Nazwa kanoniczna (np. RMF MAXXX/RMF MAXX albo Jedynka/Program 1)
    // ma pierwszeństwo, ale tylko po wykluczeniu kolidujących wariantów.
    if (candidateKey === wantedKey) {
      return 1000 + Math.min(20, (Number(result?.votes) || 0) / 100);
    }

    const wantedTokens = this._stationNameTokens(wanted);
    const candidateTokens = this._stationNameTokens(name);
    const similarity = this._stationNameSimilarity(wanted, name);
    if (similarity < 0.999) return -1;

    let score = 500 + similarity * 100;
    if (String(result?.countrycode || "").toUpperCase() === "PL") score += 20;
    score += Math.min(20, (Number(result?.votes) || 0) / 100);
    score -= Math.max(0, candidateTokens.length - wantedTokens.length) * 3;
    return score;
  }

  _stationLogoCommonsDirect(station) {
    // Nie przypinamy na sztywno pojedynczych plików: mogą być nieaktualne,
    // różnić się wariantem kolorystycznym albo przestać działać. Logo wybiera
    // wyszukiwarka na podstawie nazwy stacji i oceny trafności.
    return null;
  }

  async _findCommonsStationLogo(station, requestId) {
    try {
      const searchNames = this._stationLogoSearchNames(station);
      const wantedKey = this._stationLogoKey(station);
      const queries = [...new Set(searchNames.flatMap(name => [name, name + " logo"]))].slice(0, 8);

      // Wykonujemy niezależne zapytania równolegle, aby Commons nie blokował
      // przez kilka kolejnych opóźnień odpowiedzi.
      const responses = await Promise.all(queries.map(async query => {
        const url = "https://commons.wikimedia.org/w/api.php?action=query&generator=search" +
          "&gsrsearch=" + encodeURIComponent(query) +
          "&gsrnamespace=6&gsrlimit=20&prop=imageinfo&iiprop=url&iiurlwidth=500&format=json&origin=*";
        try {
          const response = await fetch(url, { headers: { "Accept": "application/json" } });
          if (!response.ok) return [];
          const data = await response.json();
          return Object.values(data?.query?.pages || {});
        } catch (_) {
          return [];
        }
      }));
      if (requestId !== this._stationLogoRequestId) return null;

      const allPages = new Map();
      for (const page of responses.flat()) {
        if (page?.pageid != null) allPages.set(String(page.pageid), page);
      }

      const wantedAliases = searchNames.map(name => ({
        name,
        tokens: this._stationNameTokens(name),
        normalized: this._normalize(name)
      })).filter(alias => alias.tokens.length);

      const candidates = [...allPages.values()].map(page => {
        const title = String(page.title || "").replace(/^File:/i, "");
        const normalizedTitle = this._normalize(title);
        const titleTokens = this._stationNameTokens(title);
        const image = page.imageinfo?.[0]?.thumburl || page.imageinfo?.[0]?.url || "";
        if (!image || this._stationLogoHasConflictingVariant(station, title)) return null;

        const aliasMatch = wantedAliases.some(alias =>
          alias.tokens.every(token => titleTokens.includes(token) ||
            (token.length >= 5 && titleTokens.some(candidate =>
              candidate.length >= 5 && this._levenshtein(token, candidate) === 1)))
        );
        if (!aliasMatch) return null;

        const logoTerms = /\b(logo|logotyp|logotype|loga|brand|znak graficzny)\b/i.test(normalizedTitle);
        const photoTerms = /\b(photo|fotografia|zdjecie|samochod|studio|nadajnik|siedziba|budynek|osoba|mapa|map)\b/i.test(normalizedTitle);
        const obsoleteTerms = /\b(old|obsolete|historic|history|stare logo|dawne logo|wersja testowa)\b/i.test(normalizedTitle);
        const startsWithBrand = wantedAliases.some(alias => normalizedTitle.startsWith(alias.normalized));
        const compactTitle = titleTokens.length <= Math.min(...wantedAliases.map(alias => alias.tokens.length)) + 3;

        // Nie akceptujemy samego podobieństwa nazwy: wynik musi wyglądać
        // na plik logo albo mieć bardzo zwięzłą nazwę zaczynającą się od marki.
        if (photoTerms || (!logoTerms && !(startsWithBrand && compactTitle))) return null;

        let score = 100;
        if (logoTerms) score += 40;
        if (startsWithBrand) score += 25;
        if (compactTitle) score += 10;
        if (obsoleteTerms) score -= 30;
        return { image, score, title };
      }).filter(Boolean).sort((a, b) => b.score - a.score);

      const best = candidates[0];
      return best ? { logo: best.image, source: "wikimedia-commons", matchedTitle: best.title } : null;
    } catch (error) {
      console.warn("AtlasCube Radio Card: Wikimedia Commons niedostępne, używam źródła zapasowego.", error);
      return null;
    }
  }

  async _loadStationLogo() {
    const station = this._getStation();
    const requestId = ++this._stationLogoRequestId;

    if (!station) {
      this._stationLogo = null;
      this._render();
      return;
    }

    const cacheKey = this._stationLogoKey(station);
    const cached = this._stationLogoCache.get(cacheKey);
    if (cached && (cached.logo || (cached.expiresAt && cached.expiresAt > Date.now()))) {
      this._stationLogo = cached;
      this._render();
      return;
    }
    // Usuwamy wygasły brak wyniku, aby ponowić wyszukiwanie.
    if (cached) this._stationLogoCache.delete(cacheKey);

    this._stationLogo = { logo: null, loading: true, station };
    this._render();

    try {
      // Radio Browser jest źródłem pierwszego wyboru. Najpierw korzystamy
      // z adresu streamu z domyślnej playlisty AtlasCube, bo URL identyfikuje
      // stację pewniej niż podobieństwo nazw (np. różne kanały RMF).
      let result = null;
      const streamUrl = await this._stationLogoStreamUrlFromDevice(station);
      if (streamUrl) {
        const byUrl = await this._stationLogoRadioBrowserGet(
          "/json/stations/byurl?url=" + encodeURIComponent(streamUrl) +
          "&hidebroken=true&limit=20"
        );
        if (requestId !== this._stationLogoRequestId) return;
        const wantedKey = this._stationLogoKey(station);
        const exactStreamMatches = byUrl
          .filter(item => item?.name && item?.favicon)
          .filter(item => this._stationLogoKey(item.name) === wantedKey)
          .sort((a, b) => (Number(b.votes) || 0) - (Number(a.votes) || 0));
        const exact = exactStreamMatches[0];
        if (exact?.favicon) {
          result = {
            logo: String(exact.favicon).replace(/^http:/i, "https:"),
            source: "radio-browser-url",
            matchedName: exact.name,
            matchedStream: streamUrl
          };
        }
      }

      // Gdy URL nie ma wiarygodnego rekordu z logo, dopiero wtedy szukamy po nazwie.
      const searchNames = this._stationLogoSearchNames(station);
        const responses = result?.logo ? [] : await Promise.all(searchNames.map(async queryName =>
          this._stationLogoRadioBrowserGet(
            "/json/stations/search?name=" + encodeURIComponent(queryName) +
            "&limit=100&order=votes&reverse=true"
          )
        ));
        if (requestId !== this._stationLogoRequestId) return;

        const unique = new Map();
        for (const item of responses.flat()) {
          if (!item?.name || !item?.favicon) continue;
          const id = this._normalize(item.name) + "|" + String(item.favicon);
          if (!unique.has(id)) unique.set(id, item);
        }

        const candidates = [...unique.values()].map(item => {
          let score = -1;
          for (const queryName of searchNames) {
            score = Math.max(score, this._stationLogoScore(item, queryName));
          }
          return { item, score };
        }).filter(entry => entry.score >= 500)
          .sort((a, b) => b.score - a.score);

        const best = candidates[0]?.item;
        if (!result?.logo && best?.favicon) {
          const logo = String(best.favicon).replace(/^http:/i, "https:");
          result = { logo, source: "radio-browser-name", matchedName: best.name };
        }

      if (requestId !== this._stationLogoRequestId) return;

      // Dopiero gdy Radio Browser nie zwrócił wiarygodnego logo, szukamy
      // w Wikimedia Commons. Nie pozwalamy, by luźny wynik Commons wyprzedził
      // oficjalnie przypisany favicon stacji.
      if (!result?.logo) {
        const stationKey = this._stationLogoKey(station);
        const isRmfSubbrand = /^rmf (fm|maxx|classic|on|24)$/.test(stationKey);
        // Commons can return a logo for a sibling RMF channel. For RMF
        // sub-brands, a missing verified Radio Browser match is safer than
        // displaying the wrong channel logo.
        if (!isRmfSubbrand) {
          result = await this._findCommonsStationLogo(station, requestId);
        }
      }

      if (requestId !== this._stationLogoRequestId) return;
      const hasLogo = Boolean(result?.logo);
      const finalResult = {
        logo: hasLogo ? result.logo : null,
        station,
        source: result?.source || "none",
        matchedName: result?.matchedName || result?.matchedTitle || null,
        // Sukces jest cache'owany na czas działania karty. Brak wyniku tylko
        // przez 3 minuty, po czym karta może spróbować ponownie bez migotania.
        expiresAt: hasLogo ? Number.MAX_SAFE_INTEGER : Date.now() + 180000,
        retryAt: hasLogo ? null : Date.now() + 180000
      };
      this._stationLogoCache.set(cacheKey, finalResult);
      this._stationLogo = finalResult;
      this._render();
    } catch (error) {
      if (requestId !== this._stationLogoRequestId) return;
      const finalResult = {
        logo: null,
        station,
        source: "none",
        error: error?.message || "Nieznany błąd",
        expiresAt: Date.now() + 30000,
        retryAt: Date.now() + 30000
      };
      this._stationLogoCache.set(cacheKey, finalResult);
      this._stationLogo = finalResult;
      this._render();
    }
  }

  async _loadArtwork() {
    const rawTrack = this._getTrack();
    const { artist, title } = this._parseTrack(rawTrack);
    const requestId = ++this._requestId;

    if (!rawTrack || !title) {
      this._applyResult({ rawTrack, artist, title, artwork: null, album: "" });
      return;
    }

    const cacheKey = this._normalize(rawTrack);

    if (this._cache.has(cacheKey)) {
      this._applyResult({
        rawTrack,
        artist,
        title,
        ...this._cache.get(cacheKey)
      });
      return;
    }

    try {
      const query = encodeURIComponent(`${artist} ${title}`);
      const url =
        `https://itunes.apple.com/search?term=${query}&country=PL&media=music&entity=song&limit=10`;

      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();

      if (requestId !== this._requestId) return;

      const results = Array.isArray(data.results) ? data.results : [];

      let best = null;
      let bestScore = -1;

      for (const result of results) {
        const score = this._scoreResult(result, artist, title);

        if (score > bestScore) {
          bestScore = score;
          best = result;
        }
      }

      const artwork = best?.artworkUrl100
        ? best.artworkUrl100
            .replace(/100x100bb\./i, "600x600bb.")
            .replace(/^http:/i, "https:")
        : null;

      const result = {
        artwork,
        album: best?.collectionName || "",
        matchScore: bestScore
      };

      this._cache.set(cacheKey, result);

      this._applyResult({
        rawTrack,
        artist,
        title,
        ...result
      });
    } catch (error) {
      if (requestId !== this._requestId) return;

      this._applyResult({
        rawTrack,
        artist,
        title,
        artwork: null,
        album: "",
        error: error?.message || "Nieznany błąd"
      });
    }
  }

  _applyResult(data) {
    this._status = "";
    this._data = data;
    this._render();
  }

  _setStatus(status) {
    this._status = status;
    this._render();
  }

  _escape(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  async _press(entityId) {
    if (!this._hass || !entityId) return;
    await this._hass.callService("button", "press", {
      entity_id: entityId
    });
  }

  _online() {
    const r = this._config?.radio || {};
    const availability = r.availability;
    if (availability) {
      const state = this._hass?.states?.[availability]?.state;
      return state !== undefined && state !== "unavailable" && state !== "unknown" && state !== "off";
    }
    const states = [r.station, r.title, r.playback, r.volume, r.source]
      .map(id => id ? this._hass?.states?.[id]?.state : undefined)
      .filter(state => state !== undefined);
    if (!states.length) return false;
    return states.some(state => state !== "unavailable" && state !== "unknown");
  }

  _render() {
    if (!this.shadowRoot) return;

    const data = this._data || {};
    const artwork = data.artwork || "";
    const r = this._config?.radio || {};
    const online = this._online();
    const station = this._hass?.states?.[r.station]?.state || "AtlasCube";
    const stationLogo = this._stationLogo?.logo || "";
    const stationLogoEnabled = this._config.show_station_logo !== false;
    const artist = data.artist || "";
    const title = data.title || "Brak informacji o utworze";
    const album = data.album || "";
    const playback = this._hass?.states?.[r.playback]?.state || "";
    const playing = playback === "playing";
    const idle = online && !playing;
    const volumeState = this._hass?.states?.[r.volume]?.state;
    const volume = Number(volumeState);
    const volumeValue = Number.isFinite(volume) ? Math.max(0, Math.min(100, volume)) : 0;
    const sourceEntity = r.source;
    const sourceState = this._hass?.states?.[sourceEntity];
    const sourceValue = sourceState?.state || "";
    const sourceOptions = Array.isArray(sourceState?.attributes?.options) ? sourceState.attributes.options : [];
    const webUrl = this._webUrl();
    const artworkEnabled = this._config.show_artwork !== false;

    const background = artworkEnabled && online && artwork
      ? `
        <img class="blur-bg-image" src="${artwork}" alt="" aria-hidden="true">
        <div class="shade"></div>
      `
      : "";

    const image = artworkEnabled && online && playing
      ? (artwork
        ? `<img class="cover" src="${artwork}" alt="Okładka">`
        : `<div class="no-cover"><ha-icon class="fallback-radio rainbow" icon="mdi:radio"></ha-icon></div>`)
      : !artworkEnabled && online && playing
        ? `<div class="no-cover"><ha-icon class="fallback-radio rainbow" icon="mdi:radio"></ha-icon></div>`
        : "";

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          color: var(--primary-text-color);
        }

        .card {
          position: relative;
          overflow: hidden;
          min-height: 0;
          border-radius: 20px;
          border: 1px solid rgba(255,255,255,.10);
          background: transparent;
          box-shadow: 0 4px 18px rgba(0,0,0,.25);
          padding: 18px;
          box-sizing: border-box;
        }

        .blur-bg-image,
        .shade,
        .fallback-bg {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
        }

        .card.has-art { min-height:500px; }
        .card.playing-noart { background: radial-gradient(circle at 50% 42%, rgba(33,150,243,.18) 0%, rgba(33,150,243,.06) 38%, rgba(0,0,0,.18) 100%); border-color:rgba(33,150,243,.35); }
        .card.offline { background:rgba(25,25,25,.45); border-color:rgba(244,67,54,.18); }
        .card.idle-ready {
          background: radial-gradient(ellipse at 50% 45%, rgba(33,150,243,.12) 0%, rgba(33,150,243,.055) 48%, rgba(0,0,0,.12) 100%);
          border-color: rgba(33,150,243,.20);
          box-shadow: 0 0 24px rgba(33,150,243,.08), 0 4px 18px rgba(0,0,0,.22);
        }
        .card.idle-ready .topbar { margin-bottom: 0; }
        .card.idle-ready .station-logo-slot,
        .card.idle-ready .station-name,
        .card.idle-ready .source { display:none !important; }
        .card.idle-ready .controls { margin-top: 8px; }
        .card.idle-ready .volume { margin-top: 10px; }


        .blur-bg-image {
          display: block;
          object-fit: cover;
          object-position: center;
          filter: blur(18px);
          transform: scale(1.0);
          opacity: .82;
          z-index: 0;
        }

        .shade {
          z-index: 1;
          background: linear-gradient(180deg, rgba(0,0,0,.18), rgba(0,0,0,.58));
        }

        .fallback-bg {
          z-index: 0;
          background: radial-gradient(circle at 50% 42%, rgba(33,150,243,.18) 0%, rgba(33,150,243,.06) 38%, rgba(0,0,0,.18) 100%);
        }

        .content {
          position: relative;
          z-index: 1;
          min-height: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
        }

        .offline-icon { width:72px; height:72px; display:grid; place-items:center; margin:18px 0 10px; }
        .offline-icon ha-icon { --mdc-icon-size:58px; color:#f44336; }
        .offline-title { font-size:17px; font-weight:700; }
        .offline-text { font-size:13px; opacity:.65; margin-top:4px; }

        .topbar { width:100%; min-height:32px; display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:6px; box-sizing:border-box; }
        .brand { display:flex; align-items:center; justify-content:flex-start; gap:7px; margin:0; font-size:16px; font-weight:800; letter-spacing:.06em; text-transform:uppercase; opacity:.94; flex:0 1 auto; min-width:0; }
        .brand-icon { font-size:22px; line-height:1; }
        .brand-cube { opacity:.58; }
        .brand.web { cursor:pointer; }
        .brand.web:active { transform:scale(.995); }
        .station-logo-slot { flex:0 0 auto; max-width:54%; height:56px; display:flex; align-items:center; justify-content:flex-end; overflow:hidden; }
        .station-logo { display:block; max-width:100%; max-height:54px; width:auto; height:auto; object-fit:contain; filter:drop-shadow(0 2px 6px rgba(0,0,0,.24)); }
        .station-logo-slot.empty { display:none; }
        .station-name { width:100%; margin:0 0 10px; display:flex; align-items:center; justify-content:center; text-align:center; font-size:20px; line-height:1.25; font-weight:700; letter-spacing:.025em; opacity:.96; overflow-wrap:anywhere; box-sizing:border-box; }

                .cover,
        .no-cover {
          width: 200px;
          height: 200px;
          border-radius: 14px;
          object-fit: cover;
          box-shadow: 0 8px 30px rgba(0,0,0,.45);
          background: rgba(0,0,0,.25);
        }

        .no-cover {
          display: flex;
          align-items: center;
          justify-content: center;
          color: rgba(255,255,255,.35);
        }

        .fallback-radio {
          --mdc-icon-size: 92px;
          width: 92px;
          height: 92px;
        }

        .fallback-radio.idle { color: rgba(255,255,255,.55); }

        .fallback-radio.rainbow {
          color: #ff0000;
          animation: atlas-rainbow 4s linear infinite;
        }

        @keyframes atlas-rainbow {
          0% { filter: hue-rotate(0deg) drop-shadow(0 0 4px rgba(255,0,0,.8)); }
          25% { filter: hue-rotate(90deg) drop-shadow(0 0 7px rgba(0,255,0,.8)); }
          50% { filter: hue-rotate(180deg) drop-shadow(0 0 8px rgba(0,220,255,.85)); }
          75% { filter: hue-rotate(270deg) drop-shadow(0 0 8px rgba(180,0,255,.85)); }
          100% { filter: hue-rotate(360deg) drop-shadow(0 0 4px rgba(255,0,0,.8)); }
        }

        .artist {
          margin-top: 16px;
          font-size: 16px;
          opacity: .78;
          text-align: center;
        }

        .title {
          margin-top: 5px;
          font-size: 23px;
          font-weight: 600;
          text-align: center;
          line-height: 1.2;
        }

        .album {
          margin-top: 8px;
          font-size: 14px;
          opacity: .68;
          text-align: center;
        }

        .controls {
          margin-top: 18px;
          display: flex;
          justify-content: center;
          align-items: center;
          gap: 10px;
        }

        button {
          font: inherit;
          color: inherit;
          cursor: pointer;
          border: 1px solid rgba(255,255,255,.10);
          outline: none;
          -webkit-tap-highlight-color: transparent;
        }

        .skip {
          width: 52px;
          height: 52px;
          flex: 0 0 52px;
          border-radius: 18px;
          background: rgba(255,255,255,.06);
          display: grid;
          place-items: center;
          backdrop-filter: blur(6px);
        }

        .skip ha-icon {
          --mdc-icon-size: 25px;
          color: rgba(255,255,255,.78);
        }

        .main {
          width: 60px;
          height: 60px;
          flex: 0 0 60px;
          border-radius: 50%;
          background: rgba(255,255,255,.10);
          border-color: rgba(255,255,255,.16);
          display: grid;
          place-items: center;
          backdrop-filter: blur(6px);
          box-shadow: 0 5px 18px rgba(0,0,0,.22);
        }

        .main.playing {
          background: rgba(33,150,243,.22);
          border-color: rgba(33,150,243,.50);
          box-shadow: 0 0 20px rgba(33,150,243,.25);
        }

        .main ha-icon {
          --mdc-icon-size: 29px;
        }

        .main.playing ha-icon { color: #2196f3; }
        .main.stopped ha-icon { color: rgba(255,255,255,.92); }

        .volume {
          width: min(360px, 90%);
          margin-top: 14px;
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .volume ha-icon {
          --mdc-icon-size: 22px;
          opacity: .75;
        }

        .volume input {
          flex: 1;
          min-width: 0;
          accent-color: #2196f3;
        }

        .volume-value {
          min-width: 38px;
          text-align: right;
          font-size: 12px;
          opacity: .65;
        }

        .source { width:min(360px,90%); margin-top:12px; display:flex; align-items:center; gap:10px; }
        .source ha-icon { --mdc-icon-size:22px; opacity:.75; }
        .source select { flex:1; min-width:0; height:36px; padding:0 10px; border:1px solid rgba(255,255,255,.12); border-radius:10px; background:rgba(0,0,0,.18); color:inherit; font:inherit; outline:none; }
      </style>

      <div class="card ${!online ? "offline" : idle ? "idle-ready" : artworkEnabled && playing && artwork ? "has-art" : !artworkEnabled && playing ? "playing-noart" : ""}">
        ${background}

        <div class="content">
          ${!online ? `<div class="topbar"><div class="brand"><span class="brand-icon">◈</span><span>ATLAS <span class="brand-cube">CUBE</span></span></div></div><div class="offline-icon"><ha-icon icon="mdi:wifi-off"></ha-icon></div><div class="offline-title">Radio AtlasCube</div><div class="offline-text">niedostępne w sieci</div>` : `<div class="topbar"><div class="brand ${webUrl ? "web" : ""}" id="brand" title="${webUrl ? "Otwórz panel AtlasCube" : ""}"><span class="brand-icon">◈</span><span>ATLAS <span class="brand-cube">CUBE</span></span></div>${stationLogoEnabled && stationLogo ? `<div class="station-logo-slot"><img class="station-logo" src="${this._escape(stationLogo)}" alt="" aria-hidden="true" onerror="this.parentElement.classList.add(&quot;empty&quot;);"></div>` : ""}</div><div class="station-name">${this._escape(station && station !== "unknown" && station !== "unavailable" ? station : "Radio internetowe")}</div>${artworkEnabled && playing ? `${image}<div class="artist">${this._escape(artist || "Nieznany wykonawca")}</div><div class="title">${this._escape(title)}</div>${album ? `<div class="album">${this._escape(album)}</div>` : ""}` : !artworkEnabled ? `${image}` : ""}`}
          ${online ? `<div class="controls">
            <button class="skip" id="previous" aria-label="Poprzednia stacja">
              <ha-icon icon="mdi:skip-previous"></ha-icon>
            </button>

            <button class="main ${playing ? "playing" : "stopped"}" id="playstop" aria-label="${playing ? "Stop" : "Play"}">
              <ha-icon icon="mdi:${playing ? "stop" : "play"}"></ha-icon>
            </button>

            <button class="skip" id="next" aria-label="Następna stacja">
              <ha-icon icon="mdi:skip-next"></ha-icon>
            </button>
          </div>` : ""}

          ${online && this._config.show_volume !== false ? `<div class="volume">
            <ha-icon icon="mdi:${volumeValue === 0 ? "volume-mute" : volumeValue < 50 ? "volume-medium" : "volume-high"}"></ha-icon>
            <input id="volume" type="range" min="0" max="100" step="1" value="${volumeValue}" aria-label="Głośność">
            <div class="volume-value">${Math.round(volumeValue)}%</div>
          </div>` : ""}

          ${online && this._config.show_source !== false && sourceOptions.length ? `<div class="source"><ha-icon icon="mdi:radio-tower"></ha-icon><select id="source" aria-label="Źródło">${sourceOptions.map(option => `<option value="${this._escape(option)}" ${option === sourceValue ? "selected" : ""}>${this._escape(option)}</option>`).join("")}</select></div>` : ""}
        </div>
      </div>
    `;

    this.shadowRoot.querySelector("#brand")?.addEventListener("click", () => {
      if (webUrl) window.open(webUrl, "_blank", "noopener,noreferrer");
    });

    this.shadowRoot.querySelector("#previous")?.addEventListener("click", () =>
      this._press(r.previous)
    );

    this.shadowRoot.querySelector("#next")?.addEventListener("click", () =>
      this._press(r.next)
    );

    this.shadowRoot.querySelector("#playstop")?.addEventListener("click", () =>
      this._press(
        playing
          ? r.stop
          : r.play
      )
    );

    this.shadowRoot.querySelector("#volume")?.addEventListener("input", event => {
      const value = Number(event.target.value);
      const label = this.shadowRoot.querySelector(".volume-value");
      if (label) label.textContent = `${Math.round(value)}%`;
    });

    this.shadowRoot.querySelector("#volume")?.addEventListener("change", async event => {
      if (!this._hass) return;
      await this._hass.callService("number", "set_value", {
        entity_id: r.volume,
        value: Number(event.target.value)
      });
    });

    this.shadowRoot.querySelector("#source")?.addEventListener("change", async event => {
      if (!this._hass) return;
      await this._hass.callService("select", "select_option", {
        entity_id: r.source,
        option: event.target.value
      });
    });
  }
}


class AtlasCubeRadioCardEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._hass = null;
    this._config = { show_artwork: true, show_source: true, show_volume: true, radio: {} };
    this._autoDetected = false;
    this._deviceRegistry = null;
    this._entityRegistry = null;
  }

  setConfig(config) {
    this._config = {
      show_artwork: true,
      show_source: true,
      show_volume: true,
      ...config,
      radio: { ...(config?.radio || {}) }
    };
    this._render();
  }

  set hass(hass) {
    this._hass = hass;

    if (!this._autoDetected && this._hass) {
      this._autoDetected = true;
      this._autoDetect().then(() => this._render());
    }

    this._render();
  }

  _states() {
    return Object.values(this._hass?.states || {});
  }

  async _loadRegistries() {
    if (!this._hass) return;
    try {
      const [devices, entities] = await Promise.all([
        this._hass.callWS({ type: "config/device_registry/list" }),
        this._hass.callWS({ type: "config/entity_registry/list" })
      ]);
      this._deviceRegistry = devices || [];
      this._entityRegistry = entities || [];
    } catch (err) {
      console.warn("AtlasCube Radio Card: nie udało się pobrać rejestru urządzeń.", err);
    }
  }

  _atlasDevice() {
    const devices = this._deviceRegistry || [];
    return devices.find(device => {
      const identifiers = (device.identifiers || []).map(pair =>
        Array.isArray(pair) ? pair.join(":") : String(pair)
      );
      return String(device.manufacturer || "").toLowerCase() === "atlascube" ||
        identifiers.some(id => id.toLowerCase().includes("atlascube"));
    }) || null;
  }

  _find(role) {
    const states = this._states();
    const atlasDevice = this._atlasDevice();
    const atlasDeviceId = atlasDevice?.id;
    const registryByEntity = new Map(
      (this._entityRegistry || []).map(entity => [entity.entity_id, entity])
    );
    const atlas = atlasDeviceId
      ? states.filter(state => registryByEntity.get(state.entity_id)?.device_id === atlasDeviceId)
      : states.filter(s => /atlascube/i.test(s.entity_id + " " + (s.attributes?.friendly_name || "")));

    const rules = {
      station: [
        s => /stacja|station/i.test(s.entity_id),
        s => /stacja|station/i.test(s.attributes?.friendly_name || "")
      ],
      title: [
        s => /tytul|title|utwor|track/i.test(s.entity_id),
        s => /tytuł|tytul|utwór|utwor|track|title/i.test(s.attributes?.friendly_name || "")
      ],
      playback: [
        s => /playback/i.test(s.entity_id),
        s => /playback/i.test(s.attributes?.friendly_name || "")
      ],
      volume: [
        s => s.entity_id.startsWith("number.") && /glosnosc|volume/i.test(s.entity_id),
        s => s.entity_id.startsWith("number.") && /głośność|glosnosc|volume/i.test(s.attributes?.friendly_name || "")
      ],
      source: [
        s => s.entity_id.startsWith("select.") && /source|źródło|zrodlo/i.test(s.entity_id + " " + (s.attributes?.friendly_name || ""))
      ],
      previous: [
        s => s.entity_id.startsWith("button.") && /previous|prev|poprzed/i.test(s.entity_id + " " + (s.attributes?.friendly_name || ""))
      ],
      play: [
        s => s.entity_id.startsWith("button.") && /play|odtworz/i.test(s.entity_id + " " + (s.attributes?.friendly_name || "")) && !/display|replay/i.test(s.entity_id)
      ],
      stop: [
        s => s.entity_id.startsWith("button.") && /stop|zatrzymaj/i.test(s.entity_id + " " + (s.attributes?.friendly_name || ""))
      ],
      next: [
        s => s.entity_id.startsWith("button.") && /next|następ|nastep/i.test(s.entity_id + " " + (s.attributes?.friendly_name || ""))
      ]
    };

    for (const predicate of (rules[role] || [])) {
      const hit = atlas.find(predicate);
      if (hit) return hit.entity_id;
    }
    return "";
  }

  async _autoDetect() {
    if (!this._deviceRegistry || !this._entityRegistry) {
      await this._loadRegistries();
    }
    const r = this._config.radio;
    for (const role of [
      "station", "title", "playback", "volume", "source",
      "previous", "play", "stop", "next"
    ]) {
      if (!r[role]) {
        const found = this._find(role);
        if (found) r[role] = found;
      }
    }

    // v0.3: do not create an availability dependency on a ping helper
    // or a guessed binary_sensor. MQTT availability is already applied by
    // Home Assistant to the native AtlasCube entities.
    //
    // If v0.2.1 previously auto-selected an IP-named ping sensor, remove it
    // so the card can test the native MQTT-derived availability path.
    if (
      r.availability &&
      /^binary_sensor\\.\\d{1,3}(?:_\\d{1,3}){3}$/.test(r.availability)
    ) {
      delete r.availability;
    }

    this._config.radio = { ...r };
    this._fire();
  }

  _fire() {
    this.dispatchEvent(new CustomEvent("config-changed", {
      detail: { config: this._config },
      bubbles: true,
      composed: true
    }));
  }

  _set(key, value) {
    this._config = {
      ...this._config,
      radio: {
        ...this._config.radio,
        [key]: value
      }
    };
    this._fire();
  }

  _entityOptions(role) {
    const domainMap = {
      station: ["sensor"],
      title: ["sensor"],
      playback: ["sensor"],
      volume: ["number"],
      source: ["select"],
      previous: ["button"],
      play: ["button"],
      stop: ["button"],
      next: ["button"],
      availability: ["binary_sensor"]
    };

    const domains = domainMap[role] || [];
    const states = this._states()
      .filter(s => domains.includes(s.entity_id.split(".")[0]))
      .sort((a, b) => a.entity_id.localeCompare(b.entity_id));

    return states.map(s => {
      const name = s.attributes?.friendly_name || s.entity_id;
      const selected = s.entity_id === this._config.radio[role] ? "selected" : "";
      return `<option value="${this._escapeAttr(s.entity_id)}" ${selected}>${this._escape(name)} — ${this._escape(s.entity_id)}</option>`;
    }).join("");
  }

  _field(role, label) {
    const value = this._config.radio[role] || "";
    return `
      <label>
        <span>${label}</span>
        <select data-role="${role}">
          <option value="">— wybierz encję —</option>
          ${this._entityOptions(role)}
        </select>
      </label>
    `;
  }

  _escape(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  _escapeAttr(value) {
    return this._escape(value);
  }

  _render() {
    const r = this._config.radio;
    const complete = [
      "station", "title", "playback", "volume", "source",
      "previous", "play", "stop", "next"
    ].every(k => !!r[k]);

    this.shadowRoot.innerHTML = `
      <style>
        :host { display:block; }
        .box {
          padding:16px;
          border-radius:16px;
          background:var(--card-background-color,#fff);
          color:var(--primary-text-color);
        }
        h2 { margin:0 0 4px; font-size:18px; }
        p { margin:0 0 16px; opacity:.65; font-size:13px; }
        .badge {
          display:inline-block;
          padding:3px 7px;
          border-radius:6px;
          background:rgba(255,193,7,.14);
          color:#c78a00;
          font-size:10px;
          font-weight:700;
          letter-spacing:.5px;
          margin-bottom:12px;
        }
        .auto {
          width:100%;
          min-height:42px;
          margin-bottom:16px;
          border:1px solid var(--divider-color);
          border-radius:10px;
          background:var(--secondary-background-color);
          color:var(--primary-text-color);
          font:inherit;
          cursor:pointer;
        }
        label { display:block; margin:0 0 12px; }
        label span {
          display:block;
          margin:0 0 5px;
          font-size:12px;
          opacity:.75;
        }
        select {
          width:100%;
          min-height:40px;
          padding:0 8px;
          border:1px solid var(--divider-color);
          border-radius:9px;
          background:var(--secondary-background-color);
          color:var(--primary-text-color);
          font:inherit;
        }
        .checks {
          display:grid;
          grid-template-columns:1fr 1fr;
          gap:10px;
          margin-top:4px;
        }
        .checks label {
          display:flex;
          align-items:center;
          gap:8px;
          margin:0;
          font-size:13px;
        }
        .checks span { margin:0; font-size:13px; }
        .ok {
          margin-top:12px;
          font-size:12px;
          color:var(--success-color,#43a047);
        }
      </style>

      <div class="box">
        <div class="badge">TEST — LOGO STACJI</div>
        <h2>AtlasCube Radio — TEST LOGO STACJI</h2>
        <p>Karta wykrywa AtlasCube i korzysta z natywnej dostępności MQTT przez stany jego encji.</p>

        <button class="auto" id="auto">🔎 Automatycznie wykryj AtlasCube</button>

        ${this._field("station", "Nazwa stacji")}
        ${this._field("title", "Tytuł utworu")}
        ${this._field("playback", "Stan odtwarzania")}
        ${this._field("volume", "Głośność")}
        ${this._field("source", "Źródło")}
        ${this._field("previous", "Poprzednia")}
        ${this._field("play", "Play")}
        ${this._field("stop", "Stop")}
        ${this._field("next", "Następna")}
        ${this._field("availability", "Dostępność — tylko ręczny override")}



        <div class="checks">
          <label>
            <input type="checkbox" id="show_artwork" ${this._config.show_artwork !== false ? "checked" : ""}>
            <span>Okładki utworów</span>
          </label>
          <label>
            <input type="checkbox" id="show_station_logo" ${this._config.show_station_logo !== false ? "checked" : ""}>
            <span>Logo stacji (TEST)</span>
          </label>
          <label>
            <input type="checkbox" id="show_source" ${this._config.show_source !== false ? "checked" : ""}>
            <span>Pokaż źródło</span>
          </label>
          <label>
            <input type="checkbox" id="show_volume" ${this._config.show_volume !== false ? "checked" : ""}>
            <span>Pokaż głośność</span>
          </label>
        </div>

        ${complete ? '<div class="ok">✓ Konfiguracja kompletna — karta jest gotowa.</div>' : ""}
      </div>
    `;

    this.shadowRoot.querySelector("#auto")?.addEventListener("click", () => {
      this._autoDetected = true;
      this._autoDetect();
      this._render();
    });

    this.shadowRoot.querySelectorAll("select[data-role]").forEach(el => {
      el.addEventListener("change", e => {
        this._set(e.target.dataset.role, e.target.value);
        this._render();
      });
    });



    this.shadowRoot.querySelector("#show_artwork")?.addEventListener("change", e => {
      this._config.show_artwork = e.target.checked;
      this._fire();
    });

    this.shadowRoot.querySelector("#show_station_logo")?.addEventListener("change", e => {
      this._config.show_station_logo = e.target.checked;
      this._fire();
    });

    this.shadowRoot.querySelector("#show_source")?.addEventListener("change", e => {
      this._config.show_source = e.target.checked;
      this._fire();
    });

    this.shadowRoot.querySelector("#show_volume")?.addEventListener("change", e => {
      this._config.show_volume = e.target.checked;
      this._fire();
    });
  }
}

customElements.define("atlascube-radio-card-station-logo-test-editor", AtlasCubeRadioCardEditor);


customElements.define("atlascube-radio-card-station-logo-test", AtlasCubeRadioCard);

window.customCards = window.customCards || [];
window.customCards.push({
  type: "atlascube-radio-card-station-logo-test",
  name: "AtlasCube Radio Card — TEST LOGO STACJI",
  description: "WERSJA TESTOWA — wyszukiwanie i wyświetlanie logo stacji radiowej",
  preview: true,
  documentationURL: "https://github.com/MarLip1981/atlascube-radio-card-station-logo-test"
});

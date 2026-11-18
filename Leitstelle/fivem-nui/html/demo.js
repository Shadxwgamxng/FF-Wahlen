/* Nur zum Ansehen im normalen Browser (index.html direkt öffnen). In FiveM passiert hier nichts.
   Parameter: ?style=modern  ?view=tableau|funk  ?sel=incident|call|ringing */
(() => {
  if (typeof GetParentResourceName === 'function') return;
  document.body.classList.add('demo');
  const p = new URLSearchParams(location.search);

  const stations = [
    ['st_fw_scharbeutz', 'FF Scharbeutz'], ['st_fw_haffkrug', 'FF Scharbeutz OF Haffkrug'], ['st_fw_sierksdorf', 'FF Sierksdorf'], ['st_fw_ahrensboek', 'FF Ahrensbök'],
    ['st_fw_eutin', 'FF Eutin'], ['st_rw_scharbeutz', 'Rettungswache Scharbeutz'], ['st_rw_eutin', 'Rettungswache Eutin'], ['st_drk_goehl', 'DRK OV Göhl'], ['st_thw_oldenburg', 'THW OV Oldenburg'],
  ].map(([id, name]) => ({ id, name }));
  const U = (id, callsign, short, type, stationId, group, status, statusTime, incidentId) => ({ id, callsign, short, type, stationId, group, status, statusTime, incidentId, alarmAt: incidentId ? '07:30' : '' });
  const units = [
    U('u1', 'Florian Ostholstein 80/11-01', 'FL 80/11-01', 'ELW 1', 'st_fw_scharbeutz', 'fw', '3', '07:31', 'i1'),
    U('u2', 'Florian Ostholstein 80/48-01', 'FL 80/48-01', 'HLF 20', 'st_fw_scharbeutz', 'fw', '4', '07:36', 'i1'),
    U('u3', 'Florian Ostholstein 80/48-02', 'FL 80/48-02', 'HLF 10', 'st_fw_scharbeutz', 'fw', 'A', '07:30', 'i1'),
    U('u4', 'Florian Ostholstein 80/32-01', 'FL 80/32-01', 'DLK 23-12', 'st_fw_scharbeutz', 'fw', '2', '06:12'),
    U('u5', 'Florian Ostholstein 80/20-01', 'FL 80/20-01', 'TLF', 'st_fw_haffkrug', 'fw', '2', '05:40'),
    U('u6', 'Florian Ostholstein 80/19-01', 'FL 80/19-01', 'MTW', 'st_fw_haffkrug', 'fw', '6', '22:10'),
    U('u7', 'Florian Ostholstein 85/48-01', 'FL 85/48-01', 'HLF 20/16', 'st_fw_sierksdorf', 'fw', '2', '07:01'),
    U('u8', 'Florian Ostholstein 03/54-02', 'FL 03/54-02', 'GW-G', 'st_fw_ahrensboek', 'fw', '2', '04:55'),
    U('u9', 'Florian Ostholstein 03/14-01', 'FL 03/14-01', 'MZF', 'st_fw_ahrensboek', 'fw', '2', '04:55'),
    U('u10', 'Florian Ostholstein 67/11-01', 'FL 67/11-01', 'ELW 1', 'st_fw_eutin', 'fw', '1', '07:20'),
    U('u11', 'Florian Ostholstein 67/48-01', 'FL 67/48-01', 'HLF 20', 'st_fw_eutin', 'fw', '2', '06:30'),
    U('u12', 'Rettung Ostholstein 80/83-01', 'RE 80/83-01', 'RTW', 'st_rw_scharbeutz', 'rd', '4', '07:35', 'i1'),
    U('u13', 'Rettung Ostholstein 80/83-02', 'RE 80/83-02', 'RTW', 'st_rw_scharbeutz', 'rd', '7', '07:12', 'i2'),
    U('u14', 'Rettung Ostholstein 80/82-01', 'RE 80/82-01', 'NEF', 'st_rw_scharbeutz', 'rd', '3', '07:33', 'i1'),
    U('u15', 'Rettung Ostholstein 67/83-01', 'RE 67/83-01', 'RTW', 'st_rw_eutin', 'rd', '2', '06:58'),
    U('u16', 'Rettung Ostholstein 67/85-01', 'RE 67/85-01', 'KTW', 'st_rw_eutin', 'rd', '8', '07:28', 'i3'),
    U('u17', 'Rotkreuz Ostholstein 42/83-01', 'RK 42/83-01', 'RTW', 'st_drk_goehl', 'rd', '2', '05:10'),
    U('u18', 'Heros Oldenburg 03/74-01', 'HE 03/74-01', 'GW-Dekon P', 'st_thw_oldenburg', 'kats', '2', '00:00'),
  ];
  const keywords = [
    { id: 'k1', code: 'FEU 00 Y', label: 'Brand Standard – Menschenleben in Gefahr', priority: 1 },
    { id: 'k2', code: 'NOTF 11', label: 'Notfall: RTW und Notarzt', priority: 1 },
    { id: 'k3', code: 'KTP 1', label: 'Krankentransport', priority: 3 },
    { id: 'k4', code: 'TH K ERK X', label: 'Erkundung – Verdacht auf Gefahrstoff', priority: 1 },
  ];
  const state = {
    center: 'IRLS Süd – Kreis Ostholstein',
    dispatcher: 'Disponent 1',
    clock: '07:38:12',
    stations,
    units,
    keywords,
    hospitals: [{ id: 'h1', name: 'Sana Kliniken Ostholstein – Eutin' }, { id: 'h2', name: 'UKSH Lübeck' }],
    calls: [
      { id: 'c1', state: 'klingelt', since: '0:14', phone: '0151 2345678', receivedAt: '07:37:58' },
      {
        id: 'c2', state: 'in_abfrage', since: '1:02', phone: '04503 77821', callerName: 'Hahn', receivedAt: '07:37:10',
        preview: 'Im Keller riecht es extrem stark nach Heizöl …', street: 'Mühlenkamp', houseNumber: '19', city: 'Scharbeutz', postcode: '23683', object: '', meldebild: '', keywordId: '',
        dialog: [
          { from: 'disp', time: '07:37', text: 'Notruf Feuerwehr und Rettungsdienst, wo genau ist der Notfallort?' },
          { from: 'caller', time: '07:37', text: 'Mühlenkamp 19 in Scharbeutz. Im Keller riecht es extrem stark, das beißt richtig in der Nase.' },
          { from: 'disp', time: '07:38', text: 'Was genau ist passiert?' },
          { from: 'caller', time: '07:38', text: 'Das Heizöl läuft jetzt in den Bodenabfluss, und zwei Mieter haben Kopfschmerzen.' },
        ],
      },
    ],
    incidents: [
      {
        id: 'i1', number: '2026-00041', keywordId: 'k1', priority: 1, state: 'vor_ort', createdAt: '07:30', alarmAt: '07:30', arrivalAt: '07:35',
        address: 'Strandallee 14, 23683 Scharbeutz', street: 'Strandallee', houseNumber: '14', city: 'Scharbeutz', postcode: '23683', object: 'Ferienwohnung 2. OG',
        callerName: 'Nowak', phone: '0172 5550199', meldebild: 'Privates Gebäude · Einfamilienhaus · Wohnung', info: 'Rauch aus Fenster 2. OG, Person im Gebäude', notes: '',
        units: ['u1', 'u2', 'u3', 'u12', 'u14'], open: '1× Drehleiter',
        suggestion: [
          { id: 'ag_haffkrug', kind: 'AG', name: 'FF Scharbeutz OF Haffkrug', types: 'TLF, MTW', eta: '8 min', dist: '0,9 km', proposed: false, hint: 'passt: Löschfahrzeug' },
          { id: 'u4', kind: 'FZG', name: 'Florian Ostholstein 80/32-01', types: 'DLK 23-12', eta: '6 min', dist: '0,6 km', proposed: true, hint: 'deckt: Drehleiter' },
          { id: 'ag_sierksdorf', kind: 'AG', name: 'FF Sierksdorf', types: 'HLF 20/16', eta: '11 min', dist: '3,7 km', proposed: false, hint: 'passt: Löschfahrzeug' },
          { id: 'u15', kind: 'FZG', name: 'Rettung Ostholstein 67/83-01', types: 'RTW', eta: '14 min', dist: '9,8 km', proposed: false, hint: 'kein offener Bedarf' },
        ],
        messages: [
          { time: '07:30', text: 'Einsatz angelegt: FEU 00 Y – Brand Standard – Menschenleben in Gefahr' },
          { time: '07:31', text: 'FF Scharbeutz rückt aus mit ELW 1, HLF 20, HLF 10.' },
          { time: '07:35', text: 'Rettung Ostholstein 80/83-01: Status 4 – Am Einsatzort' },
          { time: '07:36', text: 'Florian Ostholstein 80/48-01 (Erstes Fahrzeug): Wohnung im 2. OG verraucht, Angriffstrupp zur Menschenrettung vor.' },
        ],
      },
      { id: 'i2', number: '2026-00040', keywordId: 'k2', priority: 1, state: 'disponiert', createdAt: '07:05', address: 'Lindenweg 3, 23701 Eutin', units: ['u13'], messages: [] },
      { id: 'i3', number: '2026-00039', keywordId: 'k3', priority: 3, state: 'vor_ort', createdAt: '06:50', address: 'Sana Kliniken Ostholstein, Eutin', units: ['u16'], messages: [] },
      { id: 'i4', number: '2026-00042', keywordId: 'k4', priority: 1, state: 'neu', createdAt: '07:37', address: 'Mühlenkamp 19, 23683 Scharbeutz', units: [], messages: [], open: '1× Löschfahrzeug, 1× Erkundungsgruppe',
        suggestion: [
          { id: 'eg_ahrensboek', kind: 'EG', name: 'Erkundungsgruppe Ahrensbök', types: 'MZF, GW-G', eta: '24 min', dist: '13,5 km', proposed: true, hint: 'rückt aus mit MZF, GW-G' },
          { id: 'ag_scharbeutz', kind: 'AG', name: 'FF Scharbeutz', types: 'DLK 23-12', eta: '6 min', dist: '0,8 km', proposed: true, hint: 'rückt voraussichtlich aus mit HLF' },
        ] },
    ],
    radio: {
      groups: [
        { code: 'OH_FW', name: 'Feuerwehren Ostholstein', active: true, waiting: 1 },
        { code: 'OH_RD', name: 'Rettungsdienst Ostholstein', active: false },
        { code: 'OH_KATS', name: 'Katastrophenschutz Ostholstein', active: false },
        { code: 'SH_LFR', name: 'Luftrettung Schleswig-Holstein', active: false },
      ],
      requests: [{ id: 'r1', unitId: 'u2', incidentId: 'i1', time: '07:37', text: 'Sprechwunsch' }],
      log: [
        { time: '07:31', from: 'Florian Ostholstein 80/11-01', text: 'Status 3, wir sind auf Anfahrt.' },
        { time: '07:35', from: 'Rettung Ostholstein 80/83-01', text: 'Am Einsatzort.' },
        { time: '07:36', from: 'Florian Ostholstein 80/48-01', text: 'Wohnung im 2. OG verraucht, gehen mit einem Trupp unter PA vor.' },
      ],
    },
  };

  // Bedienungen im Browser nachspielen
  window.LW_DEMO = (name, data) => {
    const msg = (m) => window.postMessage(m, '*');
    if (name === 'close') msg({ type: 'toast', text: 'In FiveM würde sich das Fenster jetzt schließen.' });
    if (name === 'acceptCall') {
      const c = state.calls.find((x) => x.id === data.callId);
      if (c) Object.assign(c, { state: 'in_abfrage', dialog: [{ from: 'disp', time: '07:38', text: 'Notruf Feuerwehr und Rettungsdienst, wo genau ist der Notfallort?' }] });
      msg({ type: 'state', state });
    }
    if (name === 'alarm') msg({ type: 'toast', text: `${data.items.length} Einheit(en) alarmiert.`, kind: 'ok' });
    if (name === 'createIncident') return { ok: true, incidentId: 'i4' };
    return { ok: true };
  };

  const sel = p.get('sel');
  window.postMessage({ type: 'open', style: p.get('style') || 'klassisch', view: p.get('view') || 'leitstand', state }, '*');
  if (sel === 'incident') setTimeout(() => window.postMessage({ type: 'select', incidentId: 'i1' }, '*'), 50);
  if (sel === 'call') setTimeout(() => window.postMessage({ type: 'select', callId: 'c2' }, '*'), 50);
  if (sel === 'ringing') setTimeout(() => window.postMessage({ type: 'select', callId: 'c1' }, '*'), 50);
})();

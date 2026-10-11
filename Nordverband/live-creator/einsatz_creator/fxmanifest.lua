fx_version 'cerulean'
game 'gta5'
lua54 'yes'

name 'einsatz_creator'
author 'Nordverband'
description 'Eigenstaendiger Einsatz-Creator: Brand, THL, Tueroeffnung, VU und NPC-Rettungsdienst'
version '1.0.0'

-- Voraussetzung: OneSync (Fahrzeuge, Objekte und NPCs werden serverseitig erzeugt).
-- Fremdressourcen (z_fire, z_hose, QBCore, ox_target, emergencydispatch) werden zur Laufzeit erkannt.

shared_scripts {
    'config.lua',
    'config_catalog.lua',
    'shared/constants.lua',
    'shared/utils.lua',
    'shared/schema.lua',
}

client_scripts {
    'client/nui.lua',
    'client/main.lua',
    'client/camera.lua',
    'client/preview.lua',
    'client/editor.lua',
    'client/world.lua',
    'client/fire.lua',
    'client/interactions.lua',
    'client/incidents.lua',
}

server_scripts {
    'server/storage.lua',
    'bridge/framework.lua',
    'server/permissions.lua',
    'server/validation.lua',
    'server/spawner.lua',
    'server/fire.lua',
    'server/zfire.lua',
    'server/rescue.lua',
    'bridge/dispatch.lua',
    'server/alarm.lua',
    'server/incidents.lua',
    'server/random.lua',
    'server/main.lua',
}

ui_page 'html/index.html'

files {
    'html/index.html',
    'html/style.css',
    'html/app.js',
}

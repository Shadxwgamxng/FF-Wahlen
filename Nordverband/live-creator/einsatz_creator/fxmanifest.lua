fx_version 'cerulean'
game 'gta5'
lua54 'yes'

name 'einsatz_creator'
author 'Nordverband'
description 'Eigenstaendiger Einsatz-Creator: Brand, THL, Tueroeffnung, VU und NPC-Rettungsdienst'
version '1.3.4'

-- Voraussetzung: OneSync (Fahrzeuge, Objekte und NPCs werden serverseitig erzeugt).
-- Fremdressourcen (z_fire, z_hose, QBCore, ox_target, emergencydispatch) werden zur Laufzeit erkannt.

shared_scripts {
    '@ox_lib/init.lua',
    'config.lua',
    'config_catalog.lua',
    'config_medical.lua',
    'config_names.lua',
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
    'client/medical.lua',
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
    'server/medical.lua',
    'server/variants.lua',
    'server/rescue.lua',
    'bridge/dispatch.lua',
    'server/alarm.lua',
    'server/incidents.lua',
    'server/random.lua',
    'server/main.lua',
}

dependencies {
    'ox_lib',
}

ui_page 'html/index.html'

files {
    'html/index.html',
    'html/style.css',
    'html/app.js',
    'html/vendor/**/*',
    'html/img/*',
}

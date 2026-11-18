fx_version 'cerulean'
game 'gta5'
lua54 'yes'

description 'LEITWARTE Leitplatz-Overlay (NUI)'

ui_page 'html/index.html'
files { 'html/index.html', 'html/style.css', 'html/app.js', 'html/demo.js' }

shared_script '@qb-core/shared/locale.lua' -- bei Qbox ggf. entfernen
client_script 'client.lua'
server_script 'server.lua'

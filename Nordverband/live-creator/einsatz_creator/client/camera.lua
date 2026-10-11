--[[
    Freie Editor-Kamera (unabhaengig vom Spielercharakter)

    W/A/S/D bewegen, E/Leertaste hoch, Q runter, Shift schneller, Strg langsamer.
    Drehen: rechte Maustaste halten (Mausbewegung kommt aus der NUI als Delta).
]]

local U = EC.Utils

Cam = {
    handle = nil,
    pos = vector3(0.0, 0.0, 0.0),
    rot = vector3(0.0, 0.0, 0.0),
    look = false,
}

local CONTROLS = {
    forward = 32, back = 33, left = 34, right = 35,
    up = 38, up2 = 22, down = 44,
    fast = 21, slow = 36,
}

local function rotToDir(rot)
    local rx, rz = math.rad(rot.x), math.rad(rot.z)
    local c = math.cos(rx)
    return vector3(-math.sin(rz) * c, math.cos(rz) * c, math.sin(rx))
end
Cam.rotToDir = rotToDir

local function rightOf(rot)
    local rz = math.rad(rot.z)
    return vector3(math.cos(rz), math.sin(rz), 0.0)
end

local function cross(a, b)
    return vector3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x)
end

local function norm(v)
    local l = #v
    if l < 1e-6 then return v end
    return v / l
end

function Cam.create(pos, rot)
    Cam.destroy()
    Cam.pos, Cam.rot = pos, rot
    Cam.handle = CreateCamWithParams('DEFAULT_SCRIPTED_CAMERA', pos.x, pos.y, pos.z, rot.x, rot.y, rot.z, Config.Editor.fov, true, 2)
    SetCamActive(Cam.handle, true)
    RenderScriptCams(true, false, 0, true, true)
    SetFocusPosAndVel(pos.x, pos.y, pos.z, 0.0, 0.0, 0.0)
end

function Cam.destroy()
    if Cam.handle then
        RenderScriptCams(false, false, 0, true, true)
        SetCamActive(Cam.handle, false)
        DestroyCam(Cam.handle, false)
        Cam.handle = nil
    end
    ClearFocus()
    Cam.look = false
end

-- Mausbewegung waehrend gehaltener rechter Maustaste (Pixel-Delta aus der NUI)
function Cam.addLook(dx, dy)
    if not Cam.handle then return end
    local s = Config.Editor.lookSensitivity * 0.02
    local x = U.clamp(Cam.rot.x - dy * s, -89.0, 89.0)
    local z = (Cam.rot.z - dx * s) % 360.0
    Cam.rot = vector3(x, 0.0, z)
end

function Cam.update(dt)
    if not Cam.handle then return end

    if not State.inputFocused then
        local speed = Config.Editor.speed * 60.0 * dt
        if IsDisabledControlPressed(0, CONTROLS.fast) then speed = speed * Config.Editor.fastMultiplier end
        if IsDisabledControlPressed(0, CONTROLS.slow) then speed = speed * Config.Editor.slowMultiplier end

        local dir = rotToDir(Cam.rot)
        local right = rightOf(Cam.rot)
        local move = vector3(0.0, 0.0, 0.0)
        if IsDisabledControlPressed(0, CONTROLS.forward) then move = move + dir end
        if IsDisabledControlPressed(0, CONTROLS.back) then move = move - dir end
        if IsDisabledControlPressed(0, CONTROLS.right) then move = move + right end
        if IsDisabledControlPressed(0, CONTROLS.left) then move = move - right end
        if IsDisabledControlPressed(0, CONTROLS.up) or IsDisabledControlPressed(0, CONTROLS.up2) then move = move + vector3(0.0, 0.0, 1.0) end
        if IsDisabledControlPressed(0, CONTROLS.down) then move = move - vector3(0.0, 0.0, 1.0) end

        if #move > 0.001 then
            local target = Cam.pos + norm(move) * speed
            Cam.pos = Cam.clampPos(target)
        end
    end

    SetCamCoord(Cam.handle, Cam.pos.x, Cam.pos.y, Cam.pos.z)
    SetCamRot(Cam.handle, Cam.rot.x, Cam.rot.y, Cam.rot.z, 2)
    SetFocusPosAndVel(Cam.pos.x, Cam.pos.y, Cam.pos.z, 0.0, 0.0, 0.0)
end

-- Kamera im erlaubten Radius um den Einsatzmittelpunkt halten
function Cam.clampPos(p)
    local anchor = State.draft and State.draft.center and U.vec(State.draft.center) or State.anchor
    if anchor then
        local d = p - anchor
        local max = Config.Editor.maxDistance
        if #d > max then
            p = anchor + norm(d) * max
        end
    end
    if p.z < -100.0 then p = vector3(p.x, p.y, -100.0) end
    if p.z > 1500.0 then p = vector3(p.x, p.y, 1500.0) end
    return p
end

-- Kamera auf eine Position ausrichten (aus gewuenschter Entfernung)
function Cam.focusOn(target, distance)
    if not Cam.handle then return end
    target = U.vec(target)
    distance = distance or 8.0
    local back = rotToDir(vector3(-30.0, 0.0, Cam.rot.z))
    Cam.pos = Cam.clampPos(target - back * distance + vector3(0.0, 0.0, 1.0))
    local d = target - Cam.pos
    local pitch = math.deg(math.atan(d.z, math.sqrt(d.x * d.x + d.y * d.y)))
    local yaw = math.deg(math.atan(-d.x, d.y))
    Cam.rot = vector3(pitch, 0.0, yaw % 360.0)
end

----------------------------------------------------------------------------
-- Bildschirmkoordinate -> Weltstrahl
-- nx, ny: 0..1 von links oben
----------------------------------------------------------------------------
function Cam.screenRay(nx, ny)
    local forward = rotToDir(Cam.rot)
    local right = norm(rightOf(Cam.rot))
    local up = norm(cross(right, forward))
    local fov = math.rad(GetCamFov(Cam.handle))
    local aspect = GetAspectRatio(false)
    local tanV = math.tan(fov / 2.0)
    local tanH = tanV * aspect
    local sx = (nx * 2.0 - 1.0) * tanH
    local sy = (1.0 - ny * 2.0) * tanV
    local dir = norm(forward + right * sx + up * sy)
    return Cam.pos, dir
end

-- Cursorposition (0..1)
function Cam.cursor()
    local x, y = GetNuiCursorPosition()
    local w, h = GetActiveScreenResolution()
    if not w or w == 0 then return 0.5, 0.5 end
    return x / w, y / h
end

--[[
    Raycast vom Cursor in die Welt.
    flags: 1 Welt, 2 Fahrzeuge, 4 Peds, 8 Ragdolls, 16 Objekte ... (-1 alles)
    Rueckgabe: hit(bool), coords, normal, entity
]]
function Cam.raycast(nx, ny, ignore, flags)
    local origin, dir = Cam.screenRay(nx, ny)
    local to = origin + dir * Config.Editor.raycastDistance
    local ray = StartExpensiveSynchronousShapeTestLosProbe(origin.x, origin.y, origin.z, to.x, to.y, to.z, flags or -1, ignore or 0, 4)
    local _, hit, coords, normal, entity = GetShapeTestResult(ray)
    return hit == 1, coords, normal, entity
end

-- Senkrecht nach unten: Bodenhoehe an einer Position
function Cam.groundAt(pos, ignore)
    local from = vector3(pos.x, pos.y, pos.z + 3.0)
    local to = vector3(pos.x, pos.y, pos.z - 25.0)
    local ray = StartExpensiveSynchronousShapeTestLosProbe(from.x, from.y, from.z, to.x, to.y, to.z, 1 + 16, ignore or 0, 4)
    local _, hit, coords = GetShapeTestResult(ray)
    if hit == 1 then return coords end
    local found, z = GetGroundZFor_3dCoord(pos.x, pos.y, pos.z + 3.0, false)
    if found then return vector3(pos.x, pos.y, z) end
    return nil
end

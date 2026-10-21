import { describe, expect, it } from "vitest";
import { assetsFromRenpy, gameRelative, matchAsset, unusedImages } from "../src/core/assets.ts";

const rpy = {
  "renpy/cap1.rpy": [
    "label cap1:",
    "    scene bg tromba_scale with fade",
    "    scene cg bruno_corpo",
    "    show free neutro at intent_enter_right(0.88)",
    "    show tony at intent_pos(0.5), intent_close",
    "    play music ospite fadein 1.0 fadeout 1.0",
    '    play sound "sfx/door.ogg"',
    "    show screen choice_menu",
  ].join("\n"),
};

describe("assets", () => {
  const assets = assetsFromRenpy(rpy, () => "cap1.intent");
  it("lists what the Ren'Py export needs", () => {
    expect(assets.map((a) => `${a.kind}:${a.name}`)).toEqual([
      "background:bg tromba_scale", "cg:cg bruno_corpo", "sprite:free neutro", "sprite:tony", "music:ospite", "sound:sfx/door.ogg",
    ]);
    expect(assets[0].scripts).toEqual(["cap1.intent"]);
  });

  it("finds files the way Ren'Py does", () => {
    const game = gameRelative(["My Game/game/images/bg/BG Tromba_Scale.png", "My Game/game/images/tony happy.png", "My Game/game/audio/ospite.ogg", "My Game/game/sfx/door.ogg", "My Game/game/images/old.png", "My Game/README.txt"]);
    expect(game).toContain("images/tony happy.png");
    const found = Object.fromEntries(assets.map((a) => [a.name, matchAsset(a, game)]));
    expect(found["bg tromba_scale"]).toEqual(["images/bg/BG Tromba_Scale.png"]);
    expect(found["tony"]).toEqual(["images/tony happy.png"]);
    expect(found["ospite"]).toEqual(["audio/ospite.ogg"]);
    expect(found["sfx/door.ogg"]).toEqual(["sfx/door.ogg"]);
    expect(found["free neutro"]).toEqual([]);
    expect(unusedImages(assets, game)).toEqual(["images/old.png"]);
  });
});

import { assetsFromMv, engineRoot } from "../src/core/assets.ts";

describe("MV assets", () => {
  const mv = { "mv/CommonEvents.intent.json": JSON.stringify([null, { id: 1, name: "The body", list: [
    { code: 231, indent: 0, parameters: [1, "tromba_scale", 0, 0, 0, 0, 100, 100, 255, 0] },
    { code: 231, indent: 0, parameters: [10, "m_neutra", 1, 0, 408, 387, 100, 100, 255, 0] },
    { code: 101, indent: 0, parameters: ["Actor1", 0, 0, 2] },
    { code: 241, indent: 0, parameters: [{ name: "ospite", volume: 90, pitch: 100, pan: 0 }] },
    { code: 250, indent: 0, parameters: [{ name: "sfx_respiro", volume: 90, pitch: 100, pan: 0 }] },
  ] }]) };
  const assets = assetsFromMv(mv);
  it("reads pictures, faces, music and sounds with their event", () => {
    expect(assets.map((a) => `${a.kind}:${a.name}`)).toEqual(["background:tromba_scale", "sprite:m_neutra", "face:Actor1", "music:ospite", "sound:sfx_respiro"]);
    expect(assets[0].scripts).toEqual(["The body"]);
  });
  it("finds MV files, encrypted or not, under www/", () => {
    const { prefix, files } = engineRoot(["CQ/www/img/pictures/tromba_scale.png", "CQ/www/img/faces/Actor1.rpgmvp", "CQ/www/audio/bgm/ospite.ogg", "CQ/www/img/pictures/old.png", "CQ/www/js/main.js"], "mv");
    expect(prefix).toBe("CQ/www/");
    const found = Object.fromEntries(assets.map((a) => [a.name, matchAsset(a, files, "mv")]));
    expect(found).toEqual({ tromba_scale: ["img/pictures/tromba_scale.png"], m_neutra: [], Actor1: ["img/faces/Actor1.rpgmvp"], ospite: ["audio/bgm/ospite.ogg"], sfx_respiro: [] });
    expect(unusedImages(assets, files, "mv")).toEqual(["img/pictures/old.png"]);
    expect(engineRoot(["G/game/images/a.png"], "renpy")).toEqual({ prefix: "G/game/", files: ["images/a.png"] });
    expect(engineRoot(["game/images/a.png"], "renpy").files).toEqual(["images/a.png"]);
    expect(engineRoot(["img/pictures/a.png"], "mv")).toEqual({ prefix: "", files: ["img/pictures/a.png"] });
  });
});

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

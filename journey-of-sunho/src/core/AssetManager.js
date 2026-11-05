// AssetManager — 캐릭터·자전거 모델 공급처. 지금은 임시(절차적) 모델을 쓰고,
// 나중에 사진 기반 모델이 생기면 register('character', 새공장함수)로 바꿔 끼우면 다른 코드는 그대로예요.
//
// 예) 얼굴 사진만 바꾸기:   assets.config.character.faceImage = 'assets/textures/sunho-face.jpg'
//     자전거 색만 바꾸기:   assets.config.bicycle.color = 0xcc2222
//     모델 통째로 바꾸기:   assets.register('bicycle', () => new MyGltfBicycle(...))  // Bicycle.js 인터페이스 준수
import { CharacterModel } from '../player/CharacterModel.js';
import { BicycleModel } from '../bicycle/Bicycle.js';

export class AssetManager {
  constructor() {
    this.factories = new Map();
    this.config = {
      character: { faceImage: null, colors: {} },
      bicycle: { color: 0x1d6fb8 },
    };
    this.register('character', (cfg) => {
      const c = new CharacterModel({ colors: cfg.colors });
      if (cfg.faceImage) c.setFaceImage(cfg.faceImage);
      return c;
    });
    this.register('bicycle', (cfg) => new BicycleModel({ color: cfg.color }));
  }
  register(kind, factory) { this.factories.set(kind, factory); }
  create(kind) {
    const f = this.factories.get(kind);
    if (!f) throw new Error(`등록되지 않은 에셋 종류: ${kind}`);
    return f(this.config[kind] || {});
  }
}

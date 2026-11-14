import { AssetType, defineAssets } from '@iwsdk/core';

const publicAssetUrl = (filePath: string): string =>
  `${import.meta.env.BASE_URL}${filePath.replace(/^\/+/u, '')}`;

const uikitml = (fileName: string, name: string) => ({
  url: publicAssetUrl(`ui/${fileName}`),
  type: AssetType.UIKitML,
  name,
});

// Game geometry is built at runtime in src/prism-visuals.ts; the scene only
// places the two UI panels.
export default defineAssets({
  'welcome-panel': uikitml('welcome.uikitml', 'Welcome Panel'),
  'hud-panel': uikitml('hud.uikitml', 'HUD Panel'),
});

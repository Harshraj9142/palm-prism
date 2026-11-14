import { World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { mountLanding } from './landing.js';
import { PrismGameSystem } from './prism-game.js';

World.create(
  document.getElementById('scene-container') as HTMLDivElement,
  projectOptions,
).then((world) => {
  world.registerSystem(PrismGameSystem);
  mountLanding(world);
});

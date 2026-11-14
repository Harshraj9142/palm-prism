/**
 * The 2D landing page shown in a normal browser tab (including Quest Browser
 * before entering VR). It sits over the live 3D board, explains the idea in
 * three lines, and launches the immersive session.
 */
import { VisibilityState, type World } from '@iwsdk/core';
import { prismAudio } from './audio.js';
import { currentStreak, loadProgress, totalStars } from './progress.js';
import './landing.css';

const ICON_PALM = `<svg viewBox="0 0 36 36" aria-hidden="true"><path d="M18 3v10"/><path d="M14 31c-4-2-7-6-7-11v-5"/><path d="M11 21V9a2 2 0 0 1 4 0v8"/><path d="M15 16V6a2 2 0 0 1 4 0v10"/><path d="M19 16V8a2 2 0 0 1 4 0v9"/><path d="M23 17v-5a2 2 0 0 1 4 0v8c0 6-4 11-10 11h-3"/></svg>`;
const ICON_PINCH = `<svg viewBox="0 0 36 36" aria-hidden="true"><path d="M8 26c3 4 9 6 14 3"/><path d="M10 22l6-12a2 2 0 0 1 3.6 1.6L16 20"/><path d="M16 20l9-5a2 2 0 0 1 2 3.4l-9 6"/><circle cx="23" cy="12" r="1.6"/><path d="M27 6l2-2M30 10h3M26 3V1"/></svg>`;
const ICON_CRYSTAL = `<svg viewBox="0 0 36 36" aria-hidden="true"><path d="M18 3l9 10-9 20-9-20z"/><path d="M9 13h18"/><path d="M18 3l-3 10 3 20 3-20z"/></svg>`;

export function mountLanding(world: World): void {
  const progress = loadProgress();
  const stars = totalStars(progress);
  const streak = currentStreak(progress);

  const root = document.createElement('div');
  root.className = 'pp-landing';
  root.innerHTML = `
    <section class="pp-card" aria-labelledby="pp-title">
      <p class="pp-kicker">A hands-first light puzzle for Meta Quest</p>
      <h1 class="pp-title" id="pp-title">Palm <em>Prism</em></h1>
      <p class="pp-lede">Hold your palm in a beam of lamplight and tilt it. Your hand
        is the mirror. Bend the light through every crystal and hear it ring.</p>
      <ul class="pp-steps">
        <li>${ICON_PALM}<span>Hold a palm over the lamp, tilt to aim.</span></li>
        <li>${ICON_PINCH}<span>Pinch to leave a brass mirror behind.</span></li>
        <li>${ICON_CRYSTAL}<span>Light every crystal, play the Light Harp, and return for a new puzzle each day.</span></li>
      </ul>
      <button class="pp-enter" type="button">Enter VR</button>
      <p class="pp-note">Best on Meta Quest 3 or 3S with hand tracking. No controllers needed.</p>
      ${
        stars > 0
          ? `<p class="pp-progress">${stars} star${stars === 1 ? '' : 's'} in your sky${
              streak > 0 ? ` · ${streak}-day streak` : ''
            }</p>`
          : ''
      }
    </section>`;
  document.body.appendChild(root);

  const button = root.querySelector<HTMLButtonElement>('.pp-enter')!;
  const note = root.querySelector<HTMLParagraphElement>('.pp-note')!;
  if (!world.xrEnabled) {
    button.disabled = true;
    button.textContent = 'Open on a Quest to play';
    note.textContent =
      'Visit this page in Meta Quest Browser and press Enter VR. Hand tracking recommended.';
  }
  button.addEventListener('click', () => {
    prismAudio.ensure();
    world.launchXR();
  });

  world.visibilityState.subscribe((state) => {
    root.hidden = state !== VisibilityState.NonImmersive;
  });
}

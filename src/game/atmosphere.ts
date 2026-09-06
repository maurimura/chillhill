import * as THREE from 'three';
import { styles, type Settings } from '../config';

const tint = (color: string, target: string, amount: number) =>
  '#' + new THREE.Color(color).lerp(new THREE.Color(target), amount).getHexString();

/** Ground/vegetation respond to season; light and weather never rebuild terrain. */
export function worldPalette(settings: Settings) {
  const palette = { ...styles[settings.style] };
  if (settings.season === 'autumn') {
    palette.tree = tint(palette.tree, '#a56d42', 0.85);
    palette.treeLight = tint(palette.treeLight, '#d0a467', 0.85);
    palette.ground = tint(palette.ground, '#ada17c', 0.5);
  } else if (settings.season === 'winter') {
    palette.ground = '#c9d8d8';
    palette.groundLight = '#e9eeea';
    palette.tree = tint(palette.tree, '#6b8b8f', 0.6);
    palette.treeLight = '#dfe8e4';
    palette.rock = '#c9d5d2';
    palette.mountain = tint(palette.mountain, '#d5dfde', 0.65);
    palette.shoulder = '#e1e7e2';
  }
  return palette;
}

export function atmosphere(settings: Settings) {
  const palette = styles[settings.style];
  const time = {
    day: {
      sky: palette.sky,
      fog: palette.fog,
      light: palette.light,
      ambient: palette.ambient,
      sun: palette.sun,
      power: 2.6,
      fill: 2.5,
      elevation: 70,
    },
    sunset: {
      sky: tint(palette.sky, '#e6bb9d', 0.8),
      fog: '#d7b69e',
      light: '#ffc292',
      ambient: '#ddcfdf',
      sun: '#ffe1a3',
      power: 2.1,
      fill: 1.9,
      elevation: 28,
    },
    dusk: {
      sky: '#929ab9',
      fog: '#a3a8bb',
      light: '#cfb9e4',
      ambient: '#c0d3f0',
      sun: '#eddac9',
      power: 0.7,
      fill: 1.3,
      elevation: 12,
    },
    night: {
      sky: '#14263a',
      fog: '#23394c',
      light: '#a7c7f1',
      ambient: '#95b6d7',
      sun: '#deebea',
      power: 0.4,
      fill: 0.8,
      elevation: 65,
    },
  }[settings.timeOfDay];
  const cover =
    settings.weather === 'clear'
      ? 0
      : (settings.weather === 'rain' ? 1 : 0.75) * settings.weatherIntensity;
  const dark = settings.timeOfDay === 'night';
  return {
    ...time,
    sky: tint(time.sky, dark ? '#263848' : '#a6b5be', cover * 0.65),
    fog: tint(time.fog, dark ? '#314958' : '#b5c2c6', cover * 0.7),
    power: time.power * (1 - cover * 0.8),
    fill: time.fill * (1 - cover * 0.2),
    cover,
    night: dark,
    wetness: settings.weather === 'rain' ? settings.weatherIntensity : 0,
  };
}

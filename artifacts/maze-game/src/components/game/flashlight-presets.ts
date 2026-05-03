export interface FlashlightConfig {
  color: number;
  intensity: number;
  distance: number;
  angle: number;
  penumbra: number;
}

export const FLASHLIGHT_PRESETS: Record<string, FlashlightConfig> = {
  default:             { color: 0xfff5cc, intensity: 3,   distance: 16, angle: Math.PI / 7,   penumbra: 0.5 },
  flashlight_basic:    { color: 0xfff9c4, intensity: 2.5, distance: 13, angle: Math.PI / 8,   penumbra: 0.6 },
  flashlight_wide:     { color: 0xfff3e0, intensity: 3.5, distance: 20, angle: Math.PI / 4.5, penumbra: 0.3 },
  flashlight_uv:       { color: 0xce93d8, intensity: 4,   distance: 14, angle: Math.PI / 7,   penumbra: 0.2 },
  flashlight_dreamcore:{ color: 0xffe57f, intensity: 5,   distance: 26, angle: Math.PI / 6,   penumbra: 0.4 },
};

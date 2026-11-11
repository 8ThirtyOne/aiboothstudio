// Loads three.js r170 as a module, then starts the app (app.js, a classic script that uses the global THREE).
//
// The app was written for three.js r128 (2021). Two things changed since then that would alter how booths look,
// so they are kept at their r128 behavior here, in one place:
//  1. Colors: r152+ converts colors between sRGB and linear automatically. Turned off, so every color matches r128.
//  2. Lights: r155+ uses physical light units and inverse-square falloff. Lights created by the app take r128-style
//     brightness values, so they are scaled by PI (the r128 -> physical conversion) and keep r128's gentle,
//     range-limited falloff (decay 0 inside the light's distance) instead of inverse-square.
import * as T from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

T.ColorManagement.enabled = false;

// Brightness as the app writes it (r128 scale) is stored, and the renderer reads it converted to physical units.
function legacyIntensity(Base) {
  return class extends Base {
    get intensity() { return this._legacyIntensity * Math.PI; }
    set intensity(v) { this._legacyIntensity = v; }
  };
}
const AmbientLight = legacyIntensity(T.AmbientLight);
const HemisphereLight = legacyIntensity(T.HemisphereLight);
const DirectionalLight = legacyIntensity(T.DirectionalLight);
class PointLight extends legacyIntensity(T.PointLight) {
  constructor(color, intensity = 1, distance = 0) { super(color, intensity, distance, 0); }
}
class SpotLight extends legacyIntensity(T.SpotLight) {
  constructor(color, intensity = 1, distance = 0, angle = Math.PI / 3, penumbra = 0) { super(color, intensity, distance, angle, penumbra, 0); }
}

window.THREE = Object.assign({}, T, {
  AmbientLight, HemisphereLight, DirectionalLight, PointLight, SpotLight, GLTFExporter, GLTFLoader,
  sRGBEncoding: T.SRGBColorSpace, // old name, still used in a few places
});

// Same release label as this loader, so browsers never mix old and new code.
const V = new URL(import.meta.url).searchParams.get("v") || "";
const withV = src => (V ? `${src}?v=${V}` : src);
const app = document.createElement("script");
app.src = withV("/app/app.js");
// Account designs, autosave and share links build on the app, so they load once it has started.
app.onload = () => {
  ["/app/cloud.js", "/app/ai-render.js"].forEach(src => { const s = document.createElement("script"); s.src = withV(src); s.async = false; document.body.append(s); });
};
document.body.append(app);

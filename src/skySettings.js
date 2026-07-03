// ─── Sky / Ocean Settings Popup — toggle with G ───

export function initSkySettings(ocean, renderer) {
  const { skyUniforms, parameters, updateSun, water } = ocean;

  const sliders = [
    { label: 'Exposure',       get: () => renderer.toneMappingExposure,    set: v => { renderer.toneMappingExposure = v; }, min: 0.1, max: 1.5,  step: 0.01 },
    { label: 'Sun Elevation',  get: () => parameters.elevation,            set: v => { parameters.elevation = v; updateSun(); },  min: 0, max: 90,  step: 1 },
    { label: 'Sun Azimuth',    get: () => parameters.azimuth,              set: v => { parameters.azimuth = v; updateSun(); },    min: 0, max: 360, step: 1 },
    { label: 'Turbidity',      get: () => skyUniforms['turbidity'].value,  set: v => { skyUniforms['turbidity'].value = v; updateSun(); },  min: 0, max: 10, step: 0.1 },
    { label: 'Rayleigh',       get: () => skyUniforms['rayleigh'].value,   set: v => { skyUniforms['rayleigh'].value = v; updateSun(); },   min: 0, max: 4,  step: 0.05 },
    { label: 'Mie Coefficient',get: () => skyUniforms['mieCoefficient'].value, set: v => { skyUniforms['mieCoefficient'].value = v; updateSun(); }, min: 0, max: 0.05, step: 0.0005 },
    { label: 'Mie Directional', get: () => skyUniforms['mieDirectionalG'].value, set: v => { skyUniforms['mieDirectionalG'].value = v; updateSun(); }, min: 0, max: 1, step: 0.01 },
    { label: 'Water Distortion', get: () => water.material.uniforms['distortionScale'].value, set: v => { water.material.uniforms['distortionScale'].value = v; }, min: 0, max: 10, step: 0.1 },
  ];
  // (Fog Density has its own row below — it reads scene.fog, not a uniform)

  // Build DOM
  const panel = document.createElement('div');
  panel.id = 'sky-settings';
  panel.className = 'sky-settings hidden';
  panel.innerHTML = `<div class="sky-settings-title">Sky & Ocean</div>`;

  const rows = [];

  for (const s of sliders) {
    const row = document.createElement('div');
    row.className = 'sky-row';

    const label = document.createElement('label');
    label.textContent = s.label;

    const valSpan = document.createElement('span');
    valSpan.className = 'sky-val';
    valSpan.textContent = fmtVal(s.get(), s.step);

    const input = document.createElement('input');
    input.type = 'range';
    input.min = s.min;
    input.max = s.max;
    input.step = s.step;
    input.value = s.get();

    input.addEventListener('input', () => {
      const v = parseFloat(input.value);
      s.set(v);
      valSpan.textContent = fmtVal(v, s.step);
    });

    row.appendChild(label);
    row.appendChild(input);
    row.appendChild(valSpan);
    panel.appendChild(row);
    rows.push({ input, valSpan, slider: s });
  }

  // Fog density (special — scene.fog)
  {
    const row = document.createElement('div');
    row.className = 'sky-row';
    const label = document.createElement('label');
    label.textContent = 'Fog Density';
    const valSpan = document.createElement('span');
    valSpan.className = 'sky-val';

    const scene = water.parent;
    const fogVal = scene && scene.fog ? scene.fog.density * 10000 : 0.5;
    valSpan.textContent = fmtVal(fogVal, 0.01);

    const input = document.createElement('input');
    input.type = 'range';
    input.min = 0;
    input.max = 2;
    input.step = 0.01;
    input.value = fogVal;

    input.addEventListener('input', () => {
      const v = parseFloat(input.value);
      if (scene && scene.fog) scene.fog.density = v / 10000;
      valSpan.textContent = fmtVal(v, 0.01);
    });

    row.appendChild(label);
    row.appendChild(input);
    row.appendChild(valSpan);
    panel.appendChild(row);
  }

  document.body.appendChild(panel);

  // Block game input
  panel.addEventListener('keydown', e => e.stopPropagation());
  panel.addEventListener('keyup', e => e.stopPropagation());
  panel.addEventListener('mousedown', e => e.stopPropagation());
  panel.addEventListener('wheel', e => e.stopPropagation());

  let visible = false;
  function toggle() {
    visible = !visible;
    panel.classList.toggle('hidden', !visible);
    return visible;
  }

  function fmtVal(v, step) {
    const decimals = step < 0.001 ? 4 : step < 0.01 ? 3 : step < 1 ? 2 : 0;
    return v.toFixed(decimals);
  }

  return { toggle };
}

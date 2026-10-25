// Interactive SVG Anatomical Physiological Avatar for Spaceflight Human Risks
export class BodyHologram {
  constructor(containerElement, onSelectHotspot) {
    this.container = containerElement;
    this.onSelectHotspot = onSelectHotspot;
    this.activeHotspot = 'brain';
    this.render();
  }

  setActive(hotspotId) {
    this.activeHotspot = hotspotId;
    const allHotspots = this.container.querySelectorAll('.bio-hotspot');
    allHotspots.forEach(el => {
      if (el.dataset.hotspot === hotspotId) {
        el.classList.add('active');
      } else {
        el.classList.remove('active');
      }
    });
  }

  render() {
    this.container.innerHTML = `
      <div class="hologram-wrapper">
        <div class="hologram-scanner-line"></div>
        <svg class="hologram-svg" viewBox="0 0 240 380" fill="none" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="bodyGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#0284c7" stop-opacity="0.3"/>
              <stop offset="100%" stop-color="#7c3aed" stop-opacity="0.12"/>
            </linearGradient>
            <radialGradient id="hotspotGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stop-color="#38bdf8" stop-opacity="0.6"/>
              <stop offset="100%" stop-color="#38bdf8" stop-opacity="0"/>
            </radialGradient>
          </defs>

          <!-- Grid Background Matrix -->
          <g opacity="0.1" stroke="#00f2fe" stroke-width="0.5">
            <line x1="20" y1="50" x2="220" y2="50" />
            <line x1="20" y1="120" x2="220" y2="120" />
            <line x1="20" y1="190" x2="220" y2="190" />
            <line x1="20" y1="260" x2="220" y2="260" />
            <line x1="20" y1="330" x2="220" y2="330" />
            <line x1="120" y1="20" x2="120" y2="360" stroke-dasharray="3 3"/>
          </g>

          <!-- Holographic Anatomical Silhouette -->
          <g class="body-silhouette" stroke="#00f2fe" stroke-width="1.4" fill="url(#bodyGrad)">
            <!-- Head & Neck -->
            <path d="M 120 28 C 108 28 98 38 98 52 C 98 68 106 78 112 82 L 112 90 L 128 90 L 128 82 C 134 78 142 68 142 52 C 142 38 132 28 120 28 Z" />
            
            <!-- Torso & Shoulders -->
            <path d="M 112 90 L 82 102 C 72 106 68 116 68 126 L 74 195 C 75 200 78 204 84 204 L 92 204 L 96 160 L 102 215 L 138 215 L 144 160 L 148 204 L 156 204 C 162 204 165 200 166 195 L 172 126 C 172 116 168 106 158 102 L 128 90 Z" />

            <!-- Arms -->
            <path d="M 68 126 L 56 180 C 54 188 56 198 62 204 L 54 245 C 53 252 56 258 62 260 L 68 258 L 74 212 L 74 195" />
            <path d="M 172 126 L 184 180 C 186 188 184 198 178 204 L 186 245 C 187 252 184 258 178 260 L 172 258 L 166 212 L 166 195" />

            <!-- Pelvis & Legs -->
            <path d="M 102 215 L 94 285 C 93 294 92 308 90 325 L 86 352 C 85 358 89 362 96 362 L 108 362 C 112 362 114 358 113 352 L 112 320 L 116 280 L 120 230 L 124 280 L 128 320 L 127 352 C 126 358 128 362 132 362 L 144 362 C 151 362 155 358 154 352 L 150 325 C 148 308 147 294 146 285 L 138 215 Z" />
          </g>

          <!-- Spine & Structural Grid Line -->
          <g stroke="#00f2fe" opacity="0.4" stroke-width="1" stroke-dasharray="2 2">
            <line x1="120" y1="90" x2="120" y2="215" />
          </g>

          <!-- Interactive Hotspot Targets -->
          
          <!-- 1. Brain & ICP / Glymphatic System -->
          <g class="bio-hotspot active" data-hotspot="brain" transform="translate(120, 50)">
            <circle class="hotspot-pulse" r="14" fill="url(#hotspotGlow)"/>
            <circle class="hotspot-ring" r="8" stroke="#00f2fe" stroke-width="1.5" />
            <circle class="hotspot-core" r="3.5" fill="#00f2fe"/>
            <text x="20" y="4" class="hotspot-tag">NEURO / ICP</text>
          </g>

          <!-- 2. Ocular / SANS (Eyes) -->
          <g class="bio-hotspot" data-hotspot="ocular" transform="translate(120, 68)">
            <circle class="hotspot-pulse" r="10" fill="url(#hotspotGlow)"/>
            <circle class="hotspot-ring" r="6" stroke="#f59e0b" stroke-width="1.5" />
            <circle class="hotspot-core" r="2.5" fill="#f59e0b"/>
            <text x="-48" y="4" class="hotspot-tag">SANS OCULAR</text>
          </g>

          <!-- 3. Heart & Thorax (Cardiovascular) -->
          <g class="bio-hotspot" data-hotspot="cardio" transform="translate(125, 128)">
            <circle class="hotspot-pulse" r="14" fill="url(#hotspotGlow)"/>
            <circle class="hotspot-ring" r="8" stroke="#10b981" stroke-width="1.5"/>
            <circle class="hotspot-core" r="3.5" fill="#10b981"/>
            <text x="20" y="4" class="hotspot-tag">CARDIAC / HRV</text>
          </g>

          <!-- 4. Spinal Column (Elongation & Disc Hydration) -->
          <g class="bio-hotspot" data-hotspot="spine" transform="translate(120, 168)">
            <circle class="hotspot-pulse" r="11" fill="url(#hotspotGlow)"/>
            <circle class="hotspot-ring" r="6" stroke="#8b5cf6" stroke-width="1.5"/>
            <circle class="hotspot-core" r="2.5" fill="#8b5cf6"/>
            <text x="-52" y="4" class="hotspot-tag">SPINAL AXIS</text>
          </g>

          <!-- 5. Renal / Kidney Stones (Hypercalciuria) -->
          <g class="bio-hotspot" data-hotspot="renal" transform="translate(112, 192)">
            <circle class="hotspot-pulse" r="11" fill="url(#hotspotGlow)"/>
            <circle class="hotspot-ring" r="6" stroke="#f59e0b" stroke-width="1.5"/>
            <circle class="hotspot-core" r="2.5" fill="#f59e0b"/>
            <text x="20" y="4" class="hotspot-tag">RENAL / CA++</text>
          </g>

          <!-- 6. Musculoskeletal (Femur & Soleus BMD Loss) -->
          <g class="bio-hotspot" data-hotspot="musculoskeletal" transform="translate(132, 298)">
            <circle class="hotspot-pulse" r="14" fill="url(#hotspotGlow)"/>
            <circle class="hotspot-ring" r="8" stroke="#00f2fe" stroke-width="1.5"/>
            <circle class="hotspot-core" r="3.5" fill="#00f2fe"/>
            <text x="20" y="4" class="hotspot-tag">BMD / ATROPHY</text>
          </g>
        </svg>

        <div class="hologram-hud-overlay">
          <div class="hud-corner top-left"></div>
          <div class="hud-corner top-right"></div>
          <div class="hud-corner bottom-left"></div>
          <div class="hud-corner bottom-right"></div>
          <div class="hud-status-badge">MICRO-G FLUID STASIS MODEL: ACTIVE</div>
        </div>
      </div>
    `;

    // Attach click events
    this.container.querySelectorAll('.bio-hotspot').forEach(el => {
      el.addEventListener('click', () => {
        const hotspot = el.dataset.hotspot;
        this.setActive(hotspot);
        if (this.onSelectHotspot) {
          this.onSelectHotspot(hotspot);
        }
      });
    });
  }
}

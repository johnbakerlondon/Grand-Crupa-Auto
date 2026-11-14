# Grand Crupa Auto

**A full open-world crime sandbox that runs in a single HTML file.**

Grand Crupa Auto is a GTA-style third-person action game set in a low-poly city called Crupa. You play as Stephen: walk the streets, take whatever car you like, earn cash, buy weapons and property, and try to keep the police off your back. There is no installer, no server and no build step — one self-contained `.html` file with the engine, the city, the soundtrack and the font all baked in.

---

## Play it

1. Download **[`Grand-Crupa-Auto-optimized-3.html`](Grand-Crupa-Auto-optimized-3.html)**.
2. Open it in any modern browser (Chrome, Edge, Firefox, Safari).

That's the whole setup. The file works offline and can be installed to a phone home screen. Best played in landscape with sound on.

Prefer a local server? Any static server works:

```bash
python3 -m http.server 8080
# then open http://localhost:8080/Grand-Crupa-Auto-optimized-3.html
```

---

## What's in it

### The city
- A hand-built low-poly city with distinct districts, roads, parks and landmarks — Cathedral Square, City Museum, Crupa Arena, Crupa Court, Block 12, the East Freight Depot, the Hilltop Observatory and the military complex at Fort Crupa.
- Full day/night cycle with weather, working street lighting and a dusk-toned art direction — a strong side key light with soft shadow falloff, a cool rim light behind everything for silhouettes, warm lit windows and lamp pools after dark, hazy aerial perspective on the skyline, and a soft cinematic vignette over the whole view.
- A full-size **basketball court** just east of the fountain plaza: painted lines, centre circle, three-point arcs, two hoops with nets and backboards, and benches along the side. Pedestrians wander over, dribble up to a hoop and shoot at the rim.
- Traffic and a living crowd: every pedestrian has their own stride and posture, and people walk dogs, jog, shoot hoops, smoke, fold their arms, check their phones or stop to chat in pairs. They duck when shots land near them, glance at the noise, and scatter when things turn ugly.

### Driving
- Cars, vans, police cruisers, a Humvee and a drivable tank.
- Arcade handling with drift, handbrake, engine and tyre audio, horns and a siren.
- **Get in and out like GTA V** — Stephen walks to the driver's door, the door swings open, he climbs in and the door shuts behind him, with the whole sequence mirrored when he steps out.
- Carjacking: pull a driver out of a moving car and take it.
- Real damage: bodywork dents, breakable glass, burning wrecks and explosions.

### On foot
- Walk, sprint, crouch and jump, with a proper walk cycle, weapon-ready stance and reaction animations.
- Fists, a baseball bat, a 9mm pistol, a .357 revolver, an SMG, a pump shotgun and an assault rifle — each with its own damage, spread, recoil, magazine and reload time.
- Aiming, shooting, punch combos and a combat guard.

### Crime and consequences
- A GTA-style wanted level: commit crimes, get stars, and the police response escalates.
- Police chase you on foot and from their cruisers, and shoot back. Get put down and you're wasted — then back on the street.

### Money and city life
- Cash economy with a bank balance carried across everything you do.
- The armory for weapons, ammo and armour.
- Three buyable apartments where you can sleep through to morning.
- Crupa Cuts barber and Crupa Threads clothing store for customising Stephen.
- A school with a chalkboard quiz, plus jobs such as the cashier shift and taxi fares.
- Missions and side quests from contacts around the city, with a mission tracker and objectives.

### Getting around and finding things
- An in-game **atlas**: the full city map with mission contacts, marked gangs, Fort Crupa, custom waypoints and a "clear waypoint" control.
- A radar/minimap and a full HUD: wanted stars, health, armour, cash, clock, vehicle damage and weapons wheel.

### Audio
- A synthesised soundtrack with four in-car radio stations — **CRUPA FM 103.5**, **BACAU BASS 98.9**, **NEON 88.4** and **CRUPA TALK 66.6**.
- Procedural engine, siren, gunshot, footstep and impact sound effects generated in the browser with WebAudio — no audio files needed.

---

## Controls

### Keyboard and mouse
| Action | Key |
| --- | --- |
| Move | `W` `A` `S` `D` / arrow keys |
| Look | Mouse |
| Sprint | `Shift` |
| Jump | `Space` |
| Crouch | `C` |
| Interact / get in or out of a car | `E` |
| Punch / fire | `F` |
| Reload | `R` |
| Switch weapon | `Q`, or `1`–`8` for a slot |
| Camera | `V` |
| Horn (in a car) | `H` |
| Tank cannon | `G` |
| Pause | `Esc` / `P` |

### Touch
On phones and tablets a left-side thumbstick handles movement, dragging the right side of the screen looks around, and on-screen buttons cover interact, fire, handbrake, horn, radio and the rest of the HUD.

---

## Under the hood

- **One file, no dependencies to install.** Three.js and a custom renderer setup are bundled and minified inline; the Archivo typeface is embedded as base64. Nothing is fetched at runtime.
- **WebGL / Three.js** rendering with a low-poly, vertex-coloured art style, a custom clearcoat-style body shader for vehicles and instanced city geometry.
- **Procedural WebAudio** for all music and effects — the radio stations are generated note by note rather than streamed.
- **A spatial collision grid** keeps the open world fast, with AABB queries and a vehicle collider-pair pass.
- **Mobile-first UI**: safe-area aware layout, a design system built around a late-dusk Liberty City palette, and an add-to-home-screen friendly shell.

### Repository contents

| File | What it is |
| --- | --- |
| `Grand-Crupa-Auto-optimized-3.html` | The game. This is the only file you need. |
| `Grand-Crupa-Auto-optimized-3-camfix.zip` | Packaged copy of the build. |
| `app-unsigned (4).apk` | Android wrapper build (unsigned). |
| `LICENSE` | MIT licence. |

---

## Credits

**Produced by Clasa 80 Studio**

With help from Claude · Perplexity · DeepSeek · ChatGPT

Built and released by [@johnbakerlondon](https://github.com/johnbakerlondon). Everything in the game — city, vehicles, characters, weapons and music — is generated in the browser.

---

## Disclaimer

Grand Crupa Auto is an original fan-made project. It is not affiliated with, endorsed by or connected to Rockstar Games or Take-Two Interactive, and contains no assets from the Grand Theft Auto series. All geometry, code and audio are generated procedurally in the browser.

## Licence

MIT — see [LICENSE](LICENSE).

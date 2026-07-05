import { useEffect, useRef, useCallback } from 'react'
import * as THREE from 'three'

// topojson is loaded via script tag in index.html
declare const topojson: { feature: (topology: any, object: any) => any }

const CITIES = [
  { name: 'New York', lat: 40.71, lon: -74.01 },
  { name: 'London', lat: 51.51, lon: -0.13 },
  { name: 'Tokyo', lat: 35.68, lon: 139.69 },
  { name: 'Delhi', lat: 28.61, lon: 77.21 },
  { name: 'São Paulo', lat: -23.55, lon: -46.63 },
  { name: 'Sydney', lat: -33.87, lon: 151.21 },
  { name: 'Lagos', lat: 6.52, lon: 3.38 },
  { name: 'Moscow', lat: 55.75, lon: 37.62 },
  { name: 'Cairo', lat: 30.04, lon: 31.24 },
  { name: 'Beijing', lat: 39.90, lon: 116.41 },
  { name: 'Los Angeles', lat: 34.05, lon: -118.24 },
  { name: 'Paris', lat: 48.86, lon: 2.35 },
  { name: 'Jakarta', lat: -6.21, lon: 106.85 },
  { name: 'Mexico City', lat: 19.43, lon: -99.13 },
  { name: 'Toronto', lat: 43.65, lon: -79.38 },
  { name: 'Johannesburg', lat: -26.20, lon: 28.05 },
]

function latLonToVec3(lat: number, lon: number, radius: number): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180)
  const theta = (lon + 180) * (Math.PI / 180)
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  )
}

interface GlobeProps {
  onReady?: (ref: { spawnArc: (side: 'yes' | 'no') => void }) => void
}

export default function Globe({ onReady }: GlobeProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const globeRef = useRef<{
    nodes: Array<{
      pos: THREE.Vector3
      dotMat: THREE.MeshBasicMaterial
      ringMat: THREE.MeshBasicMaterial
      ringPhase: number
      sentiment: number
    }>
    spawnArc: (side: 'yes' | 'no') => void
    atmoMat: THREE.ShaderMaterial
    pulses: Array<{ mesh: THREE.Mesh | THREE.Line; life: number }>
    globeGroup: THREE.Group
  } | null>(null)

  const spawnArc = useCallback((side: 'yes' | 'no') => {
    if (!globeRef.current) return

    const { nodes, pulses, globeGroup } = globeRef.current
    const a = nodes[Math.floor(Math.random() * nodes.length)]
    const b = nodes[Math.floor(Math.random() * nodes.length)]
    if (a === b) return

    const color = side === 'yes' ? new THREE.Color(0x7ab36a) : new THREE.Color(0xc46a6a)
    const mid = a.pos.clone().add(b.pos).multiplyScalar(0.5).normalize().multiplyScalar(2 * 1.55)
    const curve = new THREE.QuadraticBezierCurve3(a.pos, mid, b.pos)
    const geo = new THREE.TubeGeometry(curve, 32, 0.0045, 6, false)
    const tube = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8 }))
    globeGroup.add(tube)
    pulses.push({ mesh: tube, life: 0 })

    const flare = new THREE.Mesh(
      new THREE.SphereGeometry(0.026, 8, 8),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 })
    )
    flare.position.copy(b.pos)
    globeGroup.add(flare)
    pulses.push({ mesh: flare, life: 0 })
  }, [])

  useEffect(() => {
    if (!containerRef.current) return

    const container = containerRef.current
    let w = container.clientWidth
    let h = container.clientHeight

    // Scene setup
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 1000)
    camera.position.z = 6.4

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setSize(w, h)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    container.appendChild(renderer.domElement)

    const globeGroup = new THREE.Group()
    scene.add(globeGroup)
    const RADIUS = 2
    const GREEN = new THREE.Color(0x7ab36a)
    const RED = new THREE.Color(0xc46a6a)

    // Star field
    const starGeo = new THREE.BufferGeometry()
    const starCount = 650
    const starPos = new Float32Array(starCount * 3)
    for (let i = 0; i < starCount; i++) {
      const r = 40 + Math.random() * 60
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(Math.random() * 2 - 1)
      starPos[i * 3] = r * Math.sin(phi) * Math.cos(theta)
      starPos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta)
      starPos[i * 3 + 2] = r * Math.cos(phi)
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3))
    scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0x607080, size: 0.05, transparent: true, opacity: 0.35 })))

    // Earth texture (night lights)
    const textureLoader = new THREE.TextureLoader()
    textureLoader.crossOrigin = 'anonymous'
    const nightTex = textureLoader.load('https://threejs.org/examples/textures/planets/earth_lights_2048.png')

    const earthMesh = new THREE.Mesh(
      new THREE.SphereGeometry(RADIUS, 96, 72),
      new THREE.MeshBasicMaterial({ map: nightTex, color: 0xb0c0d0 })
    )
    globeGroup.add(earthMesh)

    // Borders (fetched from TopoJSON)
    fetch('https://unpkg.com/world-atlas@2/countries-110m.json')
      .then(r => r.json())
      .then(topology => {
        // @ts-ignore - topojson types not available
        const geo = topojson.feature(topology, topology.objects.countries)
        const bcanvas = document.createElement('canvas')
        bcanvas.width = 2048
        bcanvas.height = 1024
        const bctx = bcanvas.getContext('2d')
        if (!bctx) return

        bctx.strokeStyle = 'rgba(62, 230, 212, 0.4)'
        bctx.lineWidth = 1

        const project = (lon: number, lat: number) => [(lon + 180) / 360 * 2048, (90 - lat) / 180 * 1024]

        // @ts-ignore
        geo.features.forEach((f: any) => {
          const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : (f.geometry.coordinates || [])
          polys.forEach((poly: any) => {
            poly.forEach((ring: any) => {
              bctx.beginPath()
              ring.forEach((pt: number[], i: number) => {
                const [x, y] = project(pt[0], pt[1])
                if (i === 0) bctx.moveTo(x, y)
                else bctx.lineTo(x, y)
              })
              bctx.stroke()
            })
          })
        })

        const borderTex = new THREE.CanvasTexture(bcanvas)
        borderTex.needsUpdate = true
        const bordersMesh = new THREE.Mesh(
          new THREE.SphereGeometry(RADIUS * 1.004, 96, 72),
          new THREE.MeshBasicMaterial({ map: borderTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.7 })
        )
        globeGroup.add(bordersMesh)
      })
      .catch(() => { })

    // Wireframe shell
    globeGroup.add(new THREE.Mesh(
      new THREE.SphereGeometry(RADIUS * 1.03, 40, 26),
      new THREE.MeshBasicMaterial({ color: 0xd4a574, wireframe: true, transparent: true, opacity: 0.045 })
    ))

    // Ring
    const ringGeo = new THREE.RingGeometry(RADIUS * 1.28, RADIUS * 1.285, 90)
    const ringMesh = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xd4a574, transparent: true, opacity: 0.32, side: THREE.DoubleSide }))
    ringMesh.rotation.x = Math.PI / 2.15
    globeGroup.add(ringMesh)

    // Tick ring
    const tickGroup = new THREE.Group()
    for (let i = 0; i < 72; i++) {
      const a = (i / 72) * Math.PI * 2
      const len = i % 6 === 0 ? 0.05 : 0.022
      const r0 = RADIUS * 1.30
      const r1 = r0 + len
      const g = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(Math.cos(a) * r0, 0, Math.sin(a) * r0),
        new THREE.Vector3(Math.cos(a) * r1, 0, Math.sin(a) * r1),
      ])
      const line = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xd4a574, transparent: true, opacity: i % 6 === 0 ? 0.5 : 0.22 }))
      tickGroup.add(line)
    }
    tickGroup.rotation.x = Math.PI / 2.15
    globeGroup.add(tickGroup)

    // Atmosphere
    const atmoMat = new THREE.ShaderMaterial({
      uniforms: {
        colorA: { value: GREEN },
        colorB: { value: RED },
        mixAmt: { value: 0.5 },
      },
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vPos;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          vPos = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vNormal;
        varying vec3 vPos;
        uniform vec3 colorA;
        uniform vec3 colorB;
        uniform float mixAmt;
        void main() {
          float intensity = pow(0.62 - dot(vNormal, vec3(0, 0, 1.0)), 2.6);
          float side = smoothstep(-1.0, 1.0, vPos.x * 0.6 + (mixAmt - 0.5) * 2.0);
          vec3 col = mix(colorB, colorA, side);
          gl_FragColor = vec4(col, intensity * 0.75);
        }
      `,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      transparent: true,
    })
    globeGroup.add(new THREE.Mesh(new THREE.SphereGeometry(RADIUS * 1.14, 48, 36), atmoMat))

    // Cities (nodes)
    const nodes = CITIES.map(c => {
      const pos = latLonToVec3(c.lat, c.lon, RADIUS * 1.012)
      const sentiment = Math.random()
      const dotMat = new THREE.MeshBasicMaterial({ color: GREEN.clone().lerp(RED, 1 - sentiment), transparent: true, opacity: 0.95 })
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.022, 10, 10), dotMat)
      dot.position.copy(pos)
      globeGroup.add(dot)

      const rMat = new THREE.MeshBasicMaterial({ color: dotMat.color, transparent: true, opacity: 0.5, side: THREE.DoubleSide })
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.028, 0.045, 24), rMat)
      ring.position.copy(pos)
      ring.lookAt(pos.clone().multiplyScalar(2))
      globeGroup.add(ring)

      return { name: c.name, pos, sentiment, dot, dotMat, ring, ringMat: rMat, ringPhase: Math.random() * Math.PI * 2 }
    })

    const pulses: Array<{ mesh: THREE.Mesh | THREE.Line; life: number }> = []

    // Store in ref
    globeRef.current = { nodes, spawnArc, atmoMat, pulses, globeGroup }

    if (onReady) {
      onReady({ spawnArc })
    }

    // Mouse parallax
    let targetRotX = 0.1
    let targetRotY = 0
    const handleMouseMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect()
      const nx = (e.clientX - rect.left) / rect.width - 0.5
      const ny = (e.clientY - rect.top) / rect.height - 0.5
      targetRotY = nx * 0.4
      targetRotX = 0.1 - ny * 0.25
    }
    container.addEventListener('mousemove', handleMouseMove)

    let t = 0
    let animationId: number
    const animate = () => {
      animationId = requestAnimationFrame(animate)
      t += 0.02
      globeGroup.rotation.y += 0.0016
      globeGroup.rotation.y += (targetRotY - 0) * 0.0006
      globeGroup.rotation.x += (targetRotX - globeGroup.rotation.x) * 0.03
      ringMesh.rotation.z += 0.0009
      tickGroup.rotation.z -= 0.0006

      nodes.forEach(n => {
        const pulse = 1 + Math.sin(t * 2 + n.ringPhase) * 0.35
        n.ring.scale.set(pulse, pulse, pulse)
        n.ringMat.opacity = 0.35 + Math.sin(t * 2 + n.ringPhase) * 0.15
      })

      for (let i = pulses.length - 1; i >= 0; i--) {
        const p = pulses[i]
        p.life += 0.018
        if (p.mesh instanceof THREE.Mesh && p.mesh.material instanceof THREE.MeshBasicMaterial) {
          p.mesh.material.opacity = Math.max(0, 0.85 - p.life)
        }
        if (p.life > 1.4) {
          globeGroup.remove(p.mesh)
          p.mesh.geometry.dispose()
          if (p.mesh.material instanceof THREE.Material) {
            p.mesh.material.dispose()
          }
          pulses.splice(i, 1)
        }
      }

      renderer.render(scene, camera)
    }
    animate()

    // Handle resize
    const handleResize = () => {
      w = container.clientWidth
      h = container.clientHeight
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
    }
    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      container.removeEventListener('mousemove', handleMouseMove)
      cancelAnimationFrame(animationId)
      renderer.dispose()
      container.removeChild(renderer.domElement)
    }
  }, [onReady, spawnArc])

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%' }}>
      <div style={{
        position: 'absolute',
        top: '6px',
        left: '6px',
        fontFamily: 'var(--font-mono)',
        fontSize: '10px',
        letterSpacing: '1px',
        color: 'var(--muted)',
        lineHeight: 1.8,
        padding: '11px 13px',
        background: 'rgba(8, 12, 17, 0.6)',
        border: '1px solid var(--line)',
        borderRadius: '8px',
        backdropFilter: 'blur(6px)',
        pointerEvents: 'none',
      }}>
        NODES ACTIVE <b style={{ color: 'var(--text)', fontWeight: 600 }}>190</b><br />
        STREAMS/SEC <b style={{ color: 'var(--text)', fontWeight: 600 }}>14</b>
      </div>
      <div style={{
        position: 'absolute',
        top: '6px',
        right: '6px',
        fontFamily: 'var(--font-mono)',
        fontSize: '10px',
        letterSpacing: '1px',
        color: 'var(--muted)',
        lineHeight: 1.8,
        padding: '11px 13px',
        background: 'rgba(8, 12, 17, 0.6)',
        border: '1px solid var(--line)',
        borderRadius: '8px',
        backdropFilter: 'blur(6px)',
        pointerEvents: 'none',
        textAlign: 'right',
      }}>
        NET SENTIMENT <b style={{ color: 'var(--text)', fontWeight: 600 }}>52% ▲</b><br />
        LATENCY <b style={{ color: 'var(--text)', fontWeight: 600 }}>0.04s</b>
      </div>
      <div style={{
        position: 'absolute',
        bottom: '8px',
        left: '50%',
        transform: 'translateX(-50%)',
        fontFamily: 'var(--font-mono)',
        fontSize: '10px',
        color: 'var(--muted-dim)',
        letterSpacing: '2px',
        pointerEvents: 'none',
      }}>
        LIVE VOTE NETWORK · 190 REGIONS
      </div>
    </div>
  )
}

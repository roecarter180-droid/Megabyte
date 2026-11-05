import { useEffect, useRef } from 'react'

/* "MB" drawn on a 5×7 pixel grid — the logo's pixel idea, built from 3D cubes */
const LETTERS = [
  ['10001', '11011', '10101', '10001', '10001', '10001', '10001'], // M
  ['11110', '10001', '10001', '11110', '10001', '10001', '11110'], // B
]
/* Small loose "pixels" flying off the top-left, like in the logo: [x, y, size] */
const BITS = [
  [-6.3, 4.3, 0.55], [-5.2, 5.1, 0.38], [-4.3, 4.5, 0.6], [-3.4, 5.5, 0.42], [-7.0, 3.3, 0.32],
  [-5.7, 3.6, 0.42], [-4.7, 6.1, 0.3], [-2.6, 4.7, 0.3], [-7.6, 4.8, 0.26], [-6.2, 6.0, 0.24],
]

const NAVY = '#10304f'
const BLUE = '#1a68b8'
const GREEN = '#2f9e4b'

function voxels() {
  const pts = []
  LETTERS.forEach((rows, li) =>
    rows.forEach((row, r) =>
      [...row].forEach((c, col) => c === '1' && pts.push([li * 6 + col - 5, 3 - r])),
    ),
  )
  return pts
}

const easeOutBack = (p) => {
  const c = 1.5
  return 1 + (c + 1) * Math.pow(p - 1, 3) + c * Math.pow(p - 1, 2)
}

export default function Hero3D() {
  const mountRef = useRef(null)

  useEffect(() => {
    const mount = mountRef.current
    let cancelled = false
    let cleanup = () => {}

    ;(async () => {
      const THREE = await import('three')
      const { RoundedBoxGeometry } = await import('three/examples/jsm/geometries/RoundedBoxGeometry.js')
      if (cancelled) return

      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches

      /* ---------- renderer / scene / camera ---------- */
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
      renderer.shadowMap.enabled = true
      renderer.shadowMap.type = THREE.PCFSoftShadowMap
      mount.appendChild(renderer.domElement)

      const scene = new THREE.Scene()
      const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100)

      scene.add(new THREE.HemisphereLight(0xffffff, 0xcfd8e2, 0.85))
      const sun = new THREE.DirectionalLight(0xffffff, 2.1)
      sun.position.set(5, 11, 9)
      sun.castShadow = true
      sun.shadow.mapSize.set(1024, 1024)
      Object.assign(sun.shadow.camera, { left: -10, right: 10, top: 10, bottom: -10, near: 1, far: 40 })
      sun.shadow.radius = 6
      scene.add(sun)
      const rim = new THREE.DirectionalLight(0x9fdcff, 0.8)
      rim.position.set(-8, 2, -6)
      scene.add(rim)

      const ground = new THREE.Mesh(
        new THREE.PlaneGeometry(40, 40),
        new THREE.ShadowMaterial({ opacity: 0.09 }),
      )
      ground.rotation.x = -Math.PI / 2
      ground.position.y = -4.8
      ground.receiveShadow = true
      scene.add(ground)

      const group = new THREE.Group()
      scene.add(group)

      /* ---------- cubes ---------- */
      const pts = voxels()
      const all = [
        ...pts.map(([x, y]) => ({ x, y, s: 0.88, bit: false })),
        ...BITS.map(([x, y, s]) => ({ x, y, s, bit: true })),
      ]
      const geo = new RoundedBoxGeometry(1, 1, 1, 3, 0.12)
      const mat = new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.1 })
      const mesh = new THREE.InstancedMesh(geo, mat, all.length)
      mesh.castShadow = true
      group.add(mesh)

      const cNavy = new THREE.Color(NAVY)
      const cBlue = new THREE.Color(BLUE)
      const cGreen = new THREE.Color(GREEN)
      const tmp = new THREE.Color()

      all.forEach((v, i) => {
        // diagonal navy → blue → green, like the logo
        const t = Math.min(1, Math.max(0, ((v.x + 5) / 10) * 0.55 + ((v.y + 3) / 6) * 0.45))
        if (v.bit) tmp.copy(cGreen).lerp(cBlue, Math.random() * 0.6)
        else if (t < 0.5) tmp.copy(cNavy).lerp(cBlue, t * 2)
        else tmp.copy(cBlue).lerp(cGreen, (t - 0.5) * 2)
        mesh.setColorAt(i, tmp)

        const dir = new THREE.Vector3().randomDirection()
        v.start = dir.multiplyScalar(12 + Math.random() * 8)
        v.rot = new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6)
        v.delay = reduce ? 0 : 0.15 + (v.x + 8) * 0.045 + Math.random() * 0.25
        v.push = 0
      })

      /* ---------- interaction ---------- */
      const mouse = { x: 0, y: 0, inside: false }
      const ndc = new THREE.Vector2()
      const ray = new THREE.Raycaster()
      const plane = new THREE.Plane()
      const hit = new THREE.Vector3()
      const local = new THREE.Vector3(99, 99, 0)

      const onMove = (e) => {
        const r = mount.getBoundingClientRect()
        mouse.x = ((e.clientX - r.left) / r.width) * 2 - 1
        mouse.y = -((e.clientY - r.top) / r.height) * 2 + 1
        mouse.inside = true
      }
      const onLeave = () => {
        mouse.inside = false
        mouse.x = 0
        mouse.y = 0
      }
      mount.addEventListener('pointermove', onMove)
      mount.addEventListener('pointerleave', onLeave)

      /* ---------- sizing ---------- */
      const resize = () => {
        const w = mount.clientWidth
        const h = mount.clientHeight
        if (!w || !h) return
        renderer.setSize(w, h, false)
        camera.aspect = w / h
        const half = Math.tan((camera.fov * Math.PI) / 360)
        const fitW = camera.aspect < 1.4 ? 20 : 16.5 // narrow screens: leave room for the turned letters
        const dist = Math.max(fitW / (2 * half * camera.aspect), 13 / (2 * half))
        camera.position.set(0, 0.6, dist)
        camera.lookAt(0, 0.4, 0)
        camera.updateProjectionMatrix()
        if (reduce) render(99)
      }
      const ro = new ResizeObserver(resize)
      ro.observe(mount)

      /* ---------- animation ---------- */
      const dummy = new THREE.Object3D()
      const clock = new THREE.Clock()
      let raf = 0
      let visible = true

      function render(t) {
        group.rotation.y += ((reduce ? -0.3 : -0.32 + mouse.x * 0.5 + Math.sin(t * 0.35) * 0.18) - group.rotation.y) * 0.06
        group.rotation.x += ((reduce ? 0.12 : -mouse.y * 0.22 + 0.12) - group.rotation.x) * 0.06
        group.updateMatrixWorld()

        // pointer position on the cube plane, in the group's local space
        if (mouse.inside && !reduce) {
          ndc.set(mouse.x, mouse.y)
          ray.setFromCamera(ndc, camera)
          plane.set(new THREE.Vector3(0, 0, 1), 0).applyMatrix4(group.matrixWorld)
          if (ray.ray.intersectPlane(plane, hit)) local.copy(group.worldToLocal(hit))
        } else {
          local.set(99, 99, 0)
        }

        all.forEach((v, i) => {
          const p = Math.min(1, Math.max(0, (t - v.delay) / 1.5))
          const e = easeOutBack(p)
          const d = Math.hypot(v.x - local.x, v.y - local.y)
          const want = Math.max(0, 1 - d / 2.6) ** 2 * 2.2
          v.push += (want - v.push) * 0.12
          const wave = reduce ? 0 : Math.sin(t * 1.6 + v.x * 0.55 + v.y * 0.35) * (v.bit ? 0.35 : 0.16)

          dummy.position.set(
            v.start.x + (v.x - v.start.x) * e,
            v.start.y + (v.y - v.start.y) * e,
            v.start.z + (0 - v.start.z) * e + wave + v.push,
          )
          const k = 1 - Math.min(1, p)
          dummy.rotation.set(
            v.rot.x * k + v.push * 0.35 + (v.bit ? t * 0.6 : 0),
            v.rot.y * k + v.push * 0.25 + (v.bit ? t * 0.4 : 0),
            v.rot.z * k,
          )
          dummy.scale.setScalar(v.s * (1 + v.push * 0.08))
          dummy.updateMatrix()
          mesh.setMatrixAt(i, dummy.matrix)
        })
        mesh.instanceMatrix.needsUpdate = true
        renderer.render(scene, camera)
      }

      const loop = () => {
        raf = requestAnimationFrame(loop)
        if (visible) render(clock.getElapsedTime())
      }

      const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting))
      io.observe(mount)

      resize()
      if (reduce) render(99)
      else loop()
      mount.classList.add('is-ready')

      cleanup = () => {
        cancelAnimationFrame(raf)
        io.disconnect()
        ro.disconnect()
        mount.removeEventListener('pointermove', onMove)
        mount.removeEventListener('pointerleave', onLeave)
        geo.dispose()
        mat.dispose()
        ground.geometry.dispose()
        ground.material.dispose()
        renderer.dispose()
        renderer.domElement.remove()
      }
    })()

    return () => {
      cancelled = true
      cleanup()
    }
  }, [])

  return <div className="hero-3d" ref={mountRef} aria-hidden="true"></div>
}

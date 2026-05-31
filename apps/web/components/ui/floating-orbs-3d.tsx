"use client"

import { useEffect, useRef } from "react"
import * as THREE from "three"

export function FloatingOrbs3D() {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current) return
    const container = containerRef.current

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(container.clientWidth, container.clientHeight)
    container.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(
      55,
      container.clientWidth / container.clientHeight,
      0.1,
      100
    )
    camera.position.z = 6

    // Lighting rig — warm gold key + cool blue fill + soft rim
    scene.add(new THREE.AmbientLight(0x100a04, 10))

    const keyLight = new THREE.DirectionalLight(0xffe090, 5)
    keyLight.position.set(4, 7, 3)
    scene.add(keyLight)

    const fillLight = new THREE.DirectionalLight(0x5080c0, 3)
    fillLight.position.set(-5, -2, 4)
    scene.add(fillLight)

    const rimLight = new THREE.DirectionalLight(0xffc880, 2.5)
    rimLight.position.set(1, -5, -2)
    scene.add(rimLight)

    const materials = [
      new THREE.MeshPhysicalMaterial({ color: 0xd4b060, metalness: 0.93, roughness: 0.07, emissive: 0x201208, emissiveIntensity: 0.55 }),
      new THREE.MeshPhysicalMaterial({ color: 0x90b8d8, metalness: 0.88, roughness: 0.12, emissive: 0x040810, emissiveIntensity: 0.40 }),
      new THREE.MeshPhysicalMaterial({ color: 0xddd4b8, metalness: 0.72, roughness: 0.28, emissive: 0x100c06, emissiveIntensity: 0.25 }),
      new THREE.MeshPhysicalMaterial({ color: 0xb88040, metalness: 0.90, roughness: 0.10, emissive: 0x160804, emissiveIntensity: 0.50 }),
    ]

    const geo = new THREE.IcosahedronGeometry(1, 5)

    // [x, y, z, radius, material_index]
    const configs: [number, number, number, number, number][] = [
      [-3.4, 1.6, -0.4, 0.56, 0],
      [ 3.9, 0.4, -1.6, 0.44, 1],
      [ 2.4, 2.9, -2.4, 0.33, 2],
      [-2.9, -2.1, -0.8, 0.52, 3],
      [ 0.6, -2.4,  0.4, 0.29, 0],
      [-1.0,  3.2, -3.2, 0.38, 1],
    ]

    const orbs = configs.map(([x, y, z, r, mi], i) => {
      const mesh = new THREE.Mesh(geo, materials[mi])
      mesh.scale.setScalar(r)
      mesh.position.set(x, y, z)
      scene.add(mesh)
      return {
        mesh,
        baseY: y,
        speed: 0.28 + (i * 0.13) % 0.45,
        phase: (i * 1.618) % (Math.PI * 2),
        rx: 0.0018 + i * 0.0007,
        ry: 0.0026 + i * 0.0011,
      }
    })

    // Ambient particles — floating golden dust
    const particleCount = 220
    const pPos = new Float32Array(particleCount * 3)
    for (let i = 0; i < particleCount; i++) {
      pPos[i * 3 + 0] = (Math.random() - 0.5) * 14
      pPos[i * 3 + 1] = (Math.random() - 0.5) * 10
      pPos[i * 3 + 2] = (Math.random() - 0.5) * 7 - 2
    }
    const pGeo = new THREE.BufferGeometry()
    pGeo.setAttribute("position", new THREE.BufferAttribute(pPos, 3))
    const pMat = new THREE.PointsMaterial({
      color: 0xd4a840,
      size: 0.014,
      transparent: true,
      opacity: 0.55,
      sizeAttenuation: true,
    })
    const particles = new THREE.Points(pGeo, pMat)
    scene.add(particles)

    // Mouse parallax
    let mx = 0, my = 0
    const onMouse = (e: MouseEvent) => {
      mx = (e.clientX / window.innerWidth - 0.5) * 2
      my = -(e.clientY / window.innerHeight - 0.5) * 2
    }
    window.addEventListener("mousemove", onMouse)

    const onResize = () => {
      const w = container.clientWidth
      const h = container.clientHeight
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
    }
    window.addEventListener("resize", onResize)

    let t = 0
    let rafId = 0

    const animate = () => {
      rafId = requestAnimationFrame(animate)
      t += 0.012

      orbs.forEach(({ mesh, baseY, speed, phase, rx, ry }) => {
        mesh.position.y = baseY + Math.sin(t * speed + phase) * 0.28
        mesh.rotation.x += rx
        mesh.rotation.y += ry
      })

      particles.rotation.y += 0.0004
      particles.rotation.x += 0.00025

      // Smooth camera parallax
      camera.position.x += (mx * 0.45 - camera.position.x) * 0.04
      camera.position.y += (my * 0.30 - camera.position.y) * 0.04

      renderer.render(scene, camera)
    }
    animate()

    return () => {
      cancelAnimationFrame(rafId)
      window.removeEventListener("mousemove", onMouse)
      window.removeEventListener("resize", onResize)
      geo.dispose()
      pGeo.dispose()
      pMat.dispose()
      materials.forEach((m) => m.dispose())
      renderer.dispose()
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement)
      }
    }
  }, [])

  return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
}

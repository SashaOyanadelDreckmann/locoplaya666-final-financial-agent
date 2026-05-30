"use client"

import { useEffect, useRef } from "react"
import * as THREE from "three"

export function ShaderAnimation() {
  const containerRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<{
    camera: THREE.Camera
    scene: THREE.Scene
    renderer: THREE.WebGLRenderer
    uniforms: any
    animationId: number
  } | null>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const container = containerRef.current

    const vertexShader = `
      void main() {
        gl_Position = vec4( position, 1.0 );
      }
    `

    // Ondas naturales multicapa con domain warping
    const fragmentShader = `
      precision highp float;
      uniform vec2 resolution;
      uniform float time;

      #define PI 3.14159265359

      void main(void) {
        // UV normalizado con aspecto correcto — escala pequeña para ondas MUY grandes
        vec2 uv = gl_FragCoord.xy / resolution.xy;
        float aspect = resolution.x / resolution.y;
        vec2 p = (uv - 0.5) * vec2(aspect, 1.0) * 1.4;

        float t = time * 0.016;

        // Domain warping — distorsiona el espacio para que las ondas sean orgánicas
        vec2 warp1 = vec2(
          sin(p.y * 1.6 + t * 1.0) * 0.38 + cos(p.x * 1.2 + t * 0.7) * 0.28,
          cos(p.x * 1.4 + t * 0.85) * 0.38 + sin(p.y * 1.0 + t * 1.2) * 0.28
        );
        vec2 wp = p + warp1 * 0.55;

        // Segunda capa de warping para más profundidad orgánica
        vec2 warp2 = vec2(
          sin(wp.y * 2.1 + t * 0.6) * 0.18 + cos(wp.x * 1.8 + t * 1.1) * 0.14,
          cos(wp.x * 2.3 + t * 0.9) * 0.18 + sin(wp.y * 1.6 + t * 0.5) * 0.14
        );
        vec2 fp = wp + warp2 * 0.4;

        // Canal R — ondas cálidas / doradas
        float r = 0.0;
        r += sin(fp.x * 2.2 + t * 1.1) * 0.28;
        r += sin(fp.y * 1.8 + t * 0.75) * 0.28;
        r += sin((fp.x + fp.y) * 1.5 + t * 0.95) * 0.22;
        r += sin(length(fp) * 2.8 - t * 1.3) * 0.22;
        r = r * 0.5 + 0.5;

        // Canal G — ondas medias / acero
        float g = 0.0;
        g += sin(fp.x * 1.7 + t * 0.88) * 0.28;
        g += sin(fp.y * 2.3 + t * 1.05) * 0.28;
        g += sin((fp.x - fp.y) * 1.9 + t * 0.65) * 0.22;
        g += sin(length(fp) * 2.3 - t * 1.0) * 0.22;
        g = g * 0.5 + 0.5;

        // Canal B — ondas frías / índigo profundo
        float b = 0.0;
        b += sin(fp.x * 1.4 + t * 1.25) * 0.28;
        b += sin(fp.y * 2.0 + t * 0.55) * 0.28;
        b += sin((fp.x * 1.1 + fp.y * 0.9) * 1.7 + t * 1.0) * 0.22;
        b += sin(length(fp) * 1.9 - t * 0.8) * 0.22;
        b = b * 0.5 + 0.5;

        // Paleta — azul acero, índigo y ocre dorado mate
        vec3 color;
        color.r = r * 0.52 + g * 0.22 + b * 0.09;
        color.g = r * 0.10 + g * 0.50 + b * 0.24;
        color.b = r * 0.06 + g * 0.13 + b * 0.82;

        color = clamp(color, 0.0, 1.0);

        gl_FragColor = vec4(color.r, color.g, color.b, 1.0);
      }
    `

    const camera = new THREE.Camera()
    camera.position.z = 1

    const scene = new THREE.Scene()
    const geometry = new THREE.PlaneGeometry(2, 2)

    const uniforms = {
      time: { type: "f", value: 1.0 },
      resolution: { type: "v2", value: new THREE.Vector2() },
    }

    const material = new THREE.ShaderMaterial({
      uniforms,
      vertexShader,
      fragmentShader,
    })

    const mesh = new THREE.Mesh(geometry, material)
    scene.add(mesh)

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(window.devicePixelRatio)
    container.appendChild(renderer.domElement)

    const onWindowResize = () => {
      const width = container.clientWidth
      const height = container.clientHeight
      renderer.setSize(width, height)
      uniforms.resolution.value.x = renderer.domElement.width
      uniforms.resolution.value.y = renderer.domElement.height
    }

    onWindowResize()
    window.addEventListener("resize", onWindowResize, false)

    const animate = () => {
      const animationId = requestAnimationFrame(animate)
      uniforms.time.value += 0.018
      renderer.render(scene, camera)
      if (sceneRef.current) sceneRef.current.animationId = animationId
    }

    sceneRef.current = { camera, scene, renderer, uniforms, animationId: 0 }
    animate()

    return () => {
      window.removeEventListener("resize", onWindowResize)
      if (sceneRef.current) {
        cancelAnimationFrame(sceneRef.current.animationId)
        if (container && sceneRef.current.renderer.domElement) {
          container.removeChild(sceneRef.current.renderer.domElement)
        }
        sceneRef.current.renderer.dispose()
        geometry.dispose()
        material.dispose()
      }
    }
  }, [])

  return <div ref={containerRef} className="h-full w-full" style={{ overflow: "hidden" }} />
}

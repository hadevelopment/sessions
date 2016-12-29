const glsl = require('glslify')
const mat4 = require('gl-mat4')
const vec3 = require('gl-vec3')
const createPlane = require('primitive-plane')
const TAU = 6.283185307179586
const lights = Array(2).fill().map((n, i) => i)

module.exports = function (regl) {
  const plane = createPlane(
    // size
    1, 1,
    // subdivisions
    250, 250
  )
  const rotate = mat4.rotateX([], mat4.identity([]), TAU * 0.25)
  plane.positions.forEach(position => {
    const [x, z, y] = position
    position[0] = x + 0.5
    position[1] = y
    position[2] = z + 0.5
  })

  return regl({
    vert: glsl`
      #pragma glslify: snoise3 = require(glsl-noise/simplex/3d)
      #pragma glslify: snoise2 = require(glsl-noise/simplex/2d)
      precision mediump float;
      uniform mat4 projection, model, view;
      uniform float time;
      attribute vec3 position;
      attribute vec2 uv;
      varying vec2 vUv;
      varying vec3 vNormal, vPosition;

      vec2 TERRAIN_OFFSET_POSITION = vec2(10.0);
      float LARGE_TERRAIN_HEIGHT = 0.3;
      float LARGE_TERRAIN_SCALE = 2.0;
      float SMALL_TERRAIN_HEIGHT = 0.05;
      float SMALL_TERRAIN_SCALE = 7.0;
      float SMALLEST_TERRAIN_HEIGHT = 0.02;
      float SMALLEST_TERRAIN_SCALE = 13.0;
      float TERRAIN_SPEED = 0.02;
      float EPSILON = 0.01;

      vec3 terrain(vec2 coordinate) {
        coordinate.y = pow(coordinate.y * 2.0, 2.0) - 3.0;
        coordinate.x = (coordinate.x - 0.5) * mix(0.5, 1.5, 1.0 - coordinate.y);

        return vec3(
          coordinate.x,
          LARGE_TERRAIN_HEIGHT
            * coordinate.x
            * snoise3(vec3(coordinate * LARGE_TERRAIN_SCALE + TERRAIN_OFFSET_POSITION, time * TERRAIN_SPEED)) +
          SMALL_TERRAIN_HEIGHT
            * coordinate.x
            * snoise3(vec3(coordinate * SMALL_TERRAIN_SCALE + TERRAIN_OFFSET_POSITION, time * TERRAIN_SPEED)) +
          SMALLEST_TERRAIN_HEIGHT
            * coordinate.x
            * snoise3(vec3(coordinate * SMALLEST_TERRAIN_SCALE + TERRAIN_OFFSET_POSITION, time * TERRAIN_SPEED)),
          coordinate.y
        );
      }

      vec3 calculateNormal(vec3 cartesian, vec2 coordinate) {
      	vec3 tangent = normalize(terrain(vec2(coordinate.x, coordinate.y + EPSILON)) - cartesian);
      	vec3 binormal = normalize(terrain(vec2(coordinate.x + EPSILON, coordinate.y)) - cartesian);
      	return cross(tangent, binormal);
      }

      void main () {
        vUv = uv;
        vec2 coordinate = position.xz;
        vec3 cartesian = terrain(coordinate);
        vNormal = calculateNormal(cartesian, coordinate);
        vPosition = cartesian;
        gl_Position = projection * view * vec4(cartesian, 1.0);
      }
    `,
    frag: glsl`
      precision mediump float;
      #pragma glslify: toGamma = require('glsl-gamma/out')
      #pragma glslify: rotateX = require(glsl-y-rotate/rotateX)
      #pragma glslify: rotateY = require(glsl-y-rotate/rotateY)
      #pragma glslify: rotateZ = require(glsl-y-rotate/rotateZ)
      #pragma glslify: snoise4 = require(glsl-noise/simplex/4d)

      ${lights.map(i => {
        return `uniform vec3 light${i};`
      }).join('\t\t\t\n')}

      ${lights.map(i => {
        return `uniform vec3 lightColor${i};`
      }).join('\t\t\t\n')}

      uniform mat3 viewNormal;
      uniform float time;
      varying vec3 vNormal, vPosition;
      varying vec2 vUv;
      void main () {
        float alpha = min(1.0,
          1.5 * (1.0 - length(2.0 * vUv - vec2(1.0)))
        );
        alpha = 1.0;

        // Warp the input to the surface normal noise
        vec3 positionModified = vPosition;
        positionModified.x *= 0.3 * sin((vPosition.z + vPosition.x * 0.2 + vPosition.y * 0.5) * 30.0);

        vec3 normal = (
          rotateX(0.3 * snoise4(vec4(positionModified * 10.0, 0.0))) *
          rotateX(0.05 * snoise4(vec4(positionModified * 50.0, 0.0))) *
          rotateX(0.05 * snoise4(vec4(positionModified * 100.0, 0.0))) *
          rotateY(0.3 * snoise4(vec4(vec3(300.0) + positionModified * 10.0, 0.0))) *
          rotateY(0.05 * snoise4(vec4(vec3(300.0) + positionModified * 50.0, 0.0))) *
          rotateY(0.05 * snoise4(vec4(vec3(300.0) + positionModified * 100.0, 0.0))) *
          normalize(vNormal)
        );

        vec3 baseColor = vec3(vUv, 1.0);

        vec3 color = ${lights.map(i =>
          `baseColor * lightColor${i} * max(0.0, dot(light${i}, normal))`
        ).join(' + \n')};

        // Fog
        float fogWarble1 = 0.003 * sin((-vPosition.z + vPosition.x) * 30.0 + time * 0.5);
        float fogWarble2 = 0.003 * sin((vPosition.z * 0.5 - vPosition.x) * 60.0 + time * 0.5);
        color = mix(color, vec3(0.5, 0.5, 1.0),
          mix(0.0, 0.5, max(0.0, min(1.0, (fogWarble1 + fogWarble2 - vPosition.y) * 40.0)))
        );

        // Haze
        color = mix(color, vec3(0.5, 0.5, 0.7),
          max(0.0, min(1.0, (-vPosition.z) * 0.05))
        );
        gl_FragColor = vec4(toGamma(color), alpha);
      }`,
    attributes: {
      position: plane.positions,
      uv: plane.uvs
    },
    elements: plane.cells,
    uniforms: {
      time: ({time}) => time,
      model: mat4.identity([])
    },
    lineWidth: Math.min(2 * window.devicePixelRatio, regl.limits.lineWidthDims[1]),

  })
}
/*
 * Minimal batched WebGL 2D renderer.
 * Draws solid-color triangles/quads in one buffer, flushed once per frame.
 * Coordinates are in logical (CSS) pixels with the origin at the top-left.
 */
"use strict";

const Renderer = (function () {
  const VERT_SRC = `
    attribute vec2 aPos;
    attribute vec4 aColor;
    uniform vec2 uResolution;
    varying vec4 vColor;
    void main() {
      vec2 clip = (aPos / uResolution) * 2.0 - 1.0;
      gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
      vColor = aColor;
    }
  `;

  const FRAG_SRC = `
    precision mediump float;
    varying vec4 vColor;
    void main() {
      gl_FragColor = vec4(vColor.rgb * vColor.a, vColor.a);
    }
  `;

  const FLOATS_PER_VERT = 6; // x, y, r, g, b, a
  const MAX_VERTS = 24576;

  let gl = null;
  let canvas = null;
  let program = null;
  let buffer = null;
  let uResolution = null;

  const verts = new Float32Array(MAX_VERTS * FLOATS_PER_VERT);
  let vertCount = 0;

  let logicalW = 0;
  let logicalH = 0;
  let offsetX = 0;
  let offsetY = 0;

  function compile(type, src) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, src);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error("Shader compile failed: " + gl.getShaderInfoLog(shader));
    }
    return shader;
  }

  function init(canvasEl) {
    canvas = canvasEl;
    gl = canvas.getContext("webgl", {
      alpha: false,
      antialias: true,
      preserveDrawingBuffer: false,
    });
    if (!gl) return false;

    const vs = compile(gl.VERTEX_SHADER, VERT_SRC);
    const fs = compile(gl.FRAGMENT_SHADER, FRAG_SRC);
    program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error("Program link failed: " + gl.getProgramInfoLog(program));
    }
    gl.useProgram(program);

    buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, verts.byteLength, gl.DYNAMIC_DRAW);

    const stride = FLOATS_PER_VERT * 4;
    const aPos = gl.getAttribLocation(program, "aPos");
    const aColor = gl.getAttribLocation(program, "aColor");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(aColor);
    gl.vertexAttribPointer(aColor, 4, gl.FLOAT, false, stride, 8);

    uResolution = gl.getUniformLocation(program, "uResolution");

    // Premultiplied-alpha blending; brights stack into a glow when overdrawn.
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    resize();
    return true;
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    logicalW = canvas.clientWidth;
    logicalH = canvas.clientHeight;
    const w = Math.round(logicalW * dpr);
    const h = Math.round(logicalH * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    gl.viewport(0, 0, w, h);
    gl.uniform2f(uResolution, logicalW, logicalH);
  }

  function clear(r, g, b) {
    gl.clearColor(r, g, b, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    vertCount = 0;
  }

  function setOffset(x, y) {
    offsetX = x;
    offsetY = y;
  }

  function pushVert(x, y, c) {
    if (vertCount >= MAX_VERTS) flush();
    const i = vertCount * FLOATS_PER_VERT;
    verts[i] = x + offsetX;
    verts[i + 1] = y + offsetY;
    verts[i + 2] = c[0];
    verts[i + 3] = c[1];
    verts[i + 4] = c[2];
    verts[i + 5] = c[3];
    vertCount++;
  }

  function tri(x1, y1, x2, y2, x3, y3, color) {
    pushVert(x1, y1, color);
    pushVert(x2, y2, color);
    pushVert(x3, y3, color);
  }

  function quad(x, y, w, h, color) {
    tri(x, y, x + w, y, x + w, y + h, color);
    tri(x, y, x + w, y + h, x, y + h, color);
  }

  function rotQuad(cx, cy, w, h, angle, color) {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const hw = w / 2;
    const hh = h / 2;
    const x1 = cx + (-hw * c - -hh * s), y1 = cy + (-hw * s + -hh * c);
    const x2 = cx + (hw * c - -hh * s),  y2 = cy + (hw * s + -hh * c);
    const x3 = cx + (hw * c - hh * s),   y3 = cy + (hw * s + hh * c);
    const x4 = cx + (-hw * c - hh * s),  y4 = cy + (-hw * s + hh * c);
    tri(x1, y1, x2, y2, x3, y3, color);
    tri(x1, y1, x3, y3, x4, y4, color);
  }

  // Filled circle as a triangle fan.
  function circle(cx, cy, r, color, segs) {
    const n = segs || Math.max(10, Math.min(40, Math.round(r * 0.7)));
    let px = cx + r, py = cy;
    for (let i = 1; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      tri(cx, cy, px, py, x, y, color);
      px = x;
      py = y;
    }
  }

  // Annulus segment from angle a0 to a1 (radians). Full ring if a1-a0 >= 2pi.
  function arc(cx, cy, rIn, rOut, a0, a1, color, segs) {
    const span = a1 - a0;
    const n = segs || Math.max(6, Math.min(48, Math.round(Math.abs(span) * rOut * 0.12)));
    let pc = Math.cos(a0), ps = Math.sin(a0);
    for (let i = 1; i <= n; i++) {
      const a = a0 + (span * i) / n;
      const c = Math.cos(a), s = Math.sin(a);
      tri(cx + pc * rIn, cy + ps * rIn, cx + pc * rOut, cy + ps * rOut, cx + c * rOut, cy + s * rOut, color);
      tri(cx + pc * rIn, cy + ps * rIn, cx + c * rOut, cy + s * rOut, cx + c * rIn, cy + s * rIn, color);
      pc = c;
      ps = s;
    }
  }

  function ring(cx, cy, rIn, rOut, color, segs) {
    arc(cx, cy, rIn, rOut, 0, Math.PI * 2, color, segs);
  }

  function flush() {
    if (vertCount === 0) return;
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, verts.subarray(0, vertCount * FLOATS_PER_VERT));
    gl.drawArrays(gl.TRIANGLES, 0, vertCount);
    vertCount = 0;
  }

  return {
    init,
    resize,
    clear,
    setOffset,
    tri,
    quad,
    rotQuad,
    circle,
    arc,
    ring,
    flush,
    get width() { return logicalW; },
    get height() { return logicalH; },
  };
})();

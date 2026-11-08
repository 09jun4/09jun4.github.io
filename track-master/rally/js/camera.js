// camera.js — RallyCamera: COCKPIT (default), HOOD, CHASE. C cycles.
// Cockpit and hood cameras ride on the car body (they pitch and roll with
// it, plus a little head lag); the chase camera follows with springs so
// jumps and slides look smooth.
(function (G) {
  'use strict';
  var RL = G.RL = G.RL || {};
  var MODES = ['cockpit', 'hood', 'chase'], NAMES = { cockpit: '운전석', hood: '보닛', chase: '3인칭' };
  var eul = new THREE.Euler(), v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), q1 = new THREE.Quaternion(), look = new THREE.Vector3();
  var TURN = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI / 2);

  function Cam(aspect) {
    this.cam = new THREE.PerspectiveCamera(70, aspect, 0.05, 1200);
    this.mode = 'cockpit';
    this.chase = { pos: new THREE.Vector3(), yaw: 0, y: 0, init: false };
    this.shake = 0;
  }
  Cam.prototype.cycle = function () { this.mode = MODES[(MODES.indexOf(this.mode) + 1) % MODES.length]; this.chase.init = false; return this.mode; };
  Cam.prototype.set = function (m) { if (MODES.indexOf(m) >= 0) { this.mode = m; this.chase.init = false; } };
  Cam.prototype.name = function () { return NAMES[this.mode]; };
  Cam.prototype.setFar = function (far) { this.cam.far = far; this.cam.updateProjectionMatrix(); };

  Cam.prototype.update = function (dt, car, V) {
    var c = this.cam, inside = this.mode !== 'chase';
    V.setInteriorVisible(this.mode === 'cockpit');
    V.root.updateMatrixWorld(true);
    // road shake grows with speed and on rough ground
    var rough = 0; car.wheels.forEach(function (w) { rough += Math.abs(w.compVel); });
    this.shake += (Math.min(1, rough / 6) * Math.min(1, car.speed / 20) - this.shake) * Math.min(1, dt * 8);
    if (inside) {
      var mount = this.mode === 'cockpit' ? V.parts.cockpitMount : V.parts.hoodMount;
      mount.getWorldPosition(v1); mount.getWorldQuaternion(q1);
      q1.multiply(TURN);
      if (this.mode === 'cockpit') {
        // the driver's head stays steadier than the body: only part of the
        // body pitch (nose lifting under power) and roll reach the view, and
        // the eyes look slightly down the road
        eul.setFromQuaternion(q1, 'YXZ'); eul.x = eul.x * 0.4 - 0.12; eul.z *= 0.6; q1.setFromEuler(eul);
      }
      var sh = this.shake * (this.mode === 'cockpit' ? 0.012 : 0.008);
      v1.y += (Math.random() - 0.5) * sh; v1.x += (Math.random() - 0.5) * sh * 0.5;
      c.position.copy(v1); c.quaternion.copy(q1);
      c.fov = this.mode === 'cockpit' ? 66 : 64;
    } else {
      var ch = this.chase, yaw = car.yaw;
      // follow the travel direction a little when sliding
      if (car.speed > 3) { var trav = Math.atan2(car.vz, car.vx), d = Math.atan2(Math.sin(trav - yaw), Math.cos(trav - yaw)); yaw += d * 0.35; }
      if (!ch.init) { ch.yaw = yaw; ch.y = car.y; ch.init = true; }
      var dy = Math.atan2(Math.sin(yaw - ch.yaw), Math.cos(yaw - ch.yaw));
      ch.yaw += dy * Math.min(1, dt * 5);
      ch.y += (car.y - ch.y) * Math.min(1, dt * (car.airborne ? 2.5 : 7));
      var dist = 6.2 + Math.min(1.6, car.speed * 0.03), hgt = 2.1;
      v1.set(car.x - Math.cos(ch.yaw) * dist, ch.y + hgt, car.z - Math.sin(ch.yaw) * dist);
      // keep the camera above the ground
      if (RL.World.route) { var gy = RL.Track.ground(RL.World.route, v1.x, v1.z, car.idx).y; if (v1.y < gy + 1.2) v1.y = gy + 1.2; }
      c.position.copy(v1);
      look.set(car.x + Math.cos(ch.yaw) * 3, ch.y + 0.7, car.z + Math.sin(ch.yaw) * 3);
      c.up.set(0, 1, 0); c.lookAt(look);
      c.fov = 64 + Math.min(10, car.speed * 0.18);
    }
    c.updateProjectionMatrix();
  };

  RL.Camera = { create: function (aspect) { return new Cam(aspect); }, MODES: MODES };
})(typeof window !== 'undefined' ? window : globalThis);

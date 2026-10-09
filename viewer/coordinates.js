/** The preparation uses integer sample coordinates, NOT TIFF voxel-center +0.5. */
export const RESOLUTION_NM = Object.freeze([8, 8, 40]);
export const PLANES = Object.freeze({xy: [0, 1, 2], xz: [0, 2, 1], yz: [1, 2, 0]});
export const EM_URL = 'https://bossdb-open-data.s3.amazonaws.com/iarpa_microns/minnie/minnie65/em';
export const SEG_URL = 'https://storage.googleapis.com/iarpa_microns/minnie/minnie65/seg_m1300';
export const COORDINATE_CONVENTION = 'integer-sampling-no-half-voxel';
export function validPoint(point) { return Array.isArray(point) && point.length === 3 && point.every(Number.isFinite); }
export function localToNm(local, offset, resolution = RESOLUTION_NM) {
  return local.map((value, axis) => (value + offset[axis]) * resolution[axis]);
}
export function nmToLocal(nm, offset, resolution = RESOLUTION_NM) {
  return nm.map((value, axis) => value / resolution[axis] - offset[axis]);
}
export function nmToNg(nm) { return nm.map((n, i) => n / RESOLUTION_NM[i]); }
export function ngToNm(voxel) { return voxel.map((n, i) => n * RESOLUTION_NM[i]); }
export function normalizeView(view = {}, fallback = [752960, 646592, 858640]) {
  return {...view, centerNm: validPoint(view.centerNm) ? [...view.centerNm] : [...fallback],
    plane: PLANES[view.plane] ? view.plane : 'xy', spanNm: Math.min(12288, Math.max(512, Number(view.spanNm) || 4096)),
    resolutionNm: [...RESOLUTION_NM],nativeOblique:!!view.nativeOblique};
}
export function planePlan(view, scale) {
  const [u, v, depth] = PLANES[view.plane], res = scale.resolution;
  const center = view.centerNm.map((nm, i) => Math.round(nm / res[i]));
  const width = Math.max(1, Math.round(view.spanNm / res[u])), height = Math.max(1, Math.round(view.spanNm / res[v]));
  const begin = [...center]; begin[u] -= Math.floor(width / 2); begin[v] -= Math.floor(height / 2);
  const end = begin.map(n => n + 1); end[u] = begin[u] + width; end[v] = begin[v] + height;
  return {plane: view.plane, axes: [u,v,depth], begin, end, width, height, center,
    resolutionNm: [...res], pixelSizeNm: [res[u],res[v]], physicalSizeNm: [width*res[u],height*res[v]],
    depthNm: center[depth] * res[depth], convention: COORDINATE_CONVENTION};
}
export function pixelToNm(plan, x, y) {
  const p = [...plan.begin]; p[plan.axes[0]] += Math.max(0,Math.min(plan.width-1,Math.floor(x)));
  p[plan.axes[1]] += Math.max(0,Math.min(plan.height-1,Math.floor(y)));
  return p.map((n,i) => n*plan.resolutionNm[i]);
}
export function projectPoint(plan, point) {
  const [u,v,d] = plan.axes;
  return {x: point[u]/plan.resolutionNm[u]-plan.begin[u], y: point[v]/plan.resolutionNm[v]-plan.begin[v],
    onPlane: Math.abs(point[d]-plan.depthNm) < plan.resolutionNm[d]/2 + 1e-6};
}
/** Compressed Morton ordering drops axes after their grid bit width is exhausted. */
export function mortonCode(coordinate, gridShape) {
  const bits = gridShape.map(n => Math.ceil(Math.log2(n))); let result = 0n, outputBit = 0n;
  for(let bit=0; bit<Math.max(...bits); bit++) for(let axis=0;axis<3;axis++) if(bit<bits[axis]) {
    result |= ((BigInt(coordinate[axis]) >> BigInt(bit)) & 1n) << outputBit; outputBit++;
  }
  return result;
}
export function normalizeSegments(segments = []) {
  return segments.map(s => {
    if(s.source !== 'seg_m1300' || typeof s.id !== 'string' || !/^[1-9]\d*$/.test(s.id)) throw new Error('Segment must have an exact string ID and seg_m1300 source. release661 roots are not interchangeable.');
    if(s.sourceUrl && s.sourceUrl.replace(/^precomputed:\/\//,'').replace(/\/$/,'') !== SEG_URL) throw new Error('Segment source URL does not match seg_m1300.');
    return {...s, visible:s.visible!==false, color:/^#[0-9a-f]{6}$/i.test(s.color||'')?s.color:'#66d9b4',
      identityStatus:s.identityStatus||'candidate'};
  });
}

// Display-window formula copied from the working handoff viewer.js render().
// Input delivery is adapted to native chunk planes; original samples stay separate.
export function displayedGray(value,black=0,white=255) {
  return Math.max(0,Math.min(255,Math.round((value-black)*255/(white-black))));
}

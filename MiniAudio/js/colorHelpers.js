/* Map a 0-1 range to wavelength of visible spectrum */
export function visSpect01ToWavelength(visSpect01) {
  const COLOR_MIN_NM = 390.0;
  const COLOR_MAX_NM = 680.0;

  // Map sound wavelength from 1e7nm 6.6e4nm to visible wavelength (400-700 nm)
  const wavelength = (COLOR_MAX_NM - COLOR_MIN_NM) * (1-visSpect01) + COLOR_MIN_NM;
  return wavelength;
}

/* Return an RGB color for a certain wavelength */
export function wavelengthToRGB(wavelength, intensity_max=1) {
  /**
   * Taken from Earl F. Glynn's web page:
   * <a href="http://www.efg2.com/Lab/ScienceAndEngineering/Spectra.htm">Spectra Lab Report</a>
   */
  const GAMMA = 0.80;
  intensity_max = Math.pow(255 * (intensity_max+0.2), 1.2);
  if (intensity_max < 20) intensity_max = 20;
  if (intensity_max > 255) intensity_max = 255;
  let factor;
  let red, green, blue;

  if((wavelength >= 380) && (wavelength < 440)) {
      red = -(wavelength - 440) / (440 - 380);
      green = 0.0;
      blue = 1.0;
  } else if((wavelength >= 440) && (wavelength < 490)) {
      red = 0.0;
      green = (wavelength - 440) / (490 - 440);
      blue = 1.0;
  } else if((wavelength >= 490) && (wavelength < 510)) {
      red = 0.0;
      green = 1.0;
      blue = -(wavelength - 510) / (510 - 490);
  } else if((wavelength >= 510) && (wavelength < 580)) {
      red = (wavelength - 510) / (580 - 510);
      green = 1.0;
      blue = 0.0;
  } else if((wavelength >= 580) && (wavelength < 645)) {
      red = 1.0;
      green = -(wavelength - 645) / (645 - 580);
      blue = 0.0;
  } else if((wavelength >= 645) && (wavelength < 781)) {
      red = 1.0;
      green = 0.0;
      blue = 0.0;
  } else {
      red = 0.0;
      green = 0.0;
      blue = 0.0;
  }

  // Let the intensity fall off near the vision limits
  if((wavelength >= 380) && (wavelength < 420)) {
      factor = 0.3 + 0.7 * (wavelength - 380) / (420 - 380);
  } else if((wavelength >= 420) && (wavelength < 701)) {
      factor = 1.0;
  } else if((wavelength >= 701) && (wavelength < 781)) {
      factor = 0.3 + 0.7 * (780 - wavelength) / (780 - 700);
  } else {
      factor = 0.0;
  }

  // Don't want 0^x = 1 for x <> 0
  const r = red == 0.0 ? 0 : Math.round(intensity_max * Math.pow(red * factor, GAMMA));
  const g = green == 0.0 ? 0 : Math.round(intensity_max * Math.pow(green * factor, GAMMA));
  const b = blue == 0.0 ? 0 : Math.round(intensity_max * Math.pow(blue * factor, GAMMA));
  return [r,g,b];
}



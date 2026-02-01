export {
  fromDb,
  toDb,
  getUserMic,
} from './noisyHelpers.js';

export { mkRecorder } from "./noisyRecorder.js";
export { floatToWavDownload } from "./noisyFloatToWavDownload.js";

/**
 * Create converters between linear and logarithmic scales.
 * Useful for frequency/amplitude sliders where human perception is logarithmic.
 *
 * @param {string} elementId - ID of the HTML range input element
 * @param {number} [logMin=50] - Minimum value on log scale (must be > 0)
 * @param {number} [logMax] - Maximum value on log scale (defaults to element's max attribute, or 10000)
 * @returns {Object} Object with linToLog and logToLin conversion functions
 *
 * @example
 * const freqConv = createLogLinConverter('mySlider_frequency', 50, 10000);
 *
 * // Get current frequency from slider (reads and normalizes automatically)
 * const freq = freqConv.linToLog();  // Uses slider's current value
 *
 * // Frequency to linear slider position
 * const pos = freqConv.logToLin(1000);  // ~0.565
 */
export function createLogLinConverter(elementId, logMin = 50, logMax) {
  const element = document.getElementById(elementId);
  logMax = logMax ?? (parseFloat(element?.max) || 10000);
  const logMinLn = Math.log(logMin);
  const logMaxLn = Math.log(logMax);
  const logRange = logMaxLn - logMinLn;

  /**
   * Convert slider value to logarithmic value.
   * Automatically normalizes based on the element's min/max attributes.
   * @returns {number} Value on logarithmic scale between logMin and logMax
   */
  const linToLog = () => {
    const sliderMin = parseFloat(element.min) || 0;
    const sliderMax = parseFloat(element.max) || 1;
    const value = parseFloat(element.value);
    const normalized = (value - sliderMin) / (sliderMax - sliderMin);
    if (normalized <= 0) return logMin;
    if (normalized >= 1) return logMax;
    return Math.exp(logMinLn + normalized * logRange);
  };

  /**
   * Convert logarithmic value to linear position (0-1).
   * @param {number} logVal - Value between logMin and logMax
   * @returns {number} Linear position from 0 to 1
   */
  const logToLin = (logVal) => {
    if (logVal <= logMin) return 0;
    if (logVal >= logMax) return 1;
    return (Math.log(logVal) - logMinLn) / logRange;
  };

  return { linToLog, logToLin, min: logMin, max: logMax, element };
}


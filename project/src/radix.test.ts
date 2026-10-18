import Radix from './radix';
import SVG from './svg';
import default_settings from './settings';

describe('Radix', () => {
  const data = {
    planets: {
      Sun: [0],
      Moon: [90],
    },
    cusps: [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330]
  };

  it('should draw aspect lines with default colors', () => {
    document.body.innerHTML = '<div id="chart"></div>';
    const settings = default_settings;
    const paper = new SVG('chart', 500, 500, settings);
    const radix = new Radix(paper, 500, 500, 500, data, settings);
    radix.aspects();

    const aspectLines = document.querySelectorAll('#chart-astrology-aspects > line');
    expect(aspectLines[0].getAttribute('stroke')).toBe(default_settings.ASPECTS.square.color);
  });

  it('should draw aspect lines with custom colors via settings', () => {
    document.body.innerHTML = '<div id="chart"></div>';

    const settings = {
      ...default_settings,
      ASPECTS: {
        square: { degree: 90, orbit: 10, color: 'purple' },
      },
    };

    const paper = new SVG('chart', 500, 500, settings);
    const radix = new Radix(paper, 500, 500, 500, data, settings);
    radix.aspects();

    const aspectLines = document.querySelectorAll('#chart-astrology-aspects > line');
    expect(aspectLines[0].getAttribute('stroke')).toBe('purple');
  });
});

describe('Radix aspect line width', () => {
  it('draws tighter orbs with thicker lines', () => {
    document.body.innerHTML = '<div id="chart"></div>';
    const data = {
      // Sun-Moon trine 0.8° from exact, Sun-Mars square 1.56°, Sun-Venus square 3.5°
      planets: { Sun: [10], Moon: [130.8], Mars: [101.56], Venus: [276.5] },
      cusps: [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330]
    };
    const paper = new SVG('chart', 500, 500, default_settings);
    const radix = new Radix(paper, 500, 500, 500, data, default_settings);
    radix.aspects();

    const width = (a: string, b: string): number => {
      const line = Array.from(document.querySelectorAll('#chart-astrology-aspects > line')).find(l =>
        [l.getAttribute('data-point'), l.getAttribute('data-toPoint')].sort().join() === [a, b].sort().join())
      return parseFloat(line!.getAttribute('stroke-width')!);
    };

    const trine = width('Sun', 'Moon');
    const tightSquare = width('Sun', 'Mars');
    const wideSquare = width('Sun', 'Venus');
    expect(trine).toBeGreaterThan(tightSquare);
    expect(tightSquare).toBeGreaterThan(wideSquare);
    expect(trine).toBeLessThanOrEqual(default_settings.ASPECT_STROKE_MAX * default_settings.SYMBOL_SCALE);
    expect(wideSquare).toBeGreaterThanOrEqual(default_settings.ASPECT_STROKE_MIN * default_settings.SYMBOL_SCALE);
  });
});
